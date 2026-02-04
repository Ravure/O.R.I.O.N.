/**
 * Yield History Storage
 * SQLite-based persistence for yield scanning results
 * 
 * Features:
 * - Store historical yield data
 * - Query by chain, protocol, or time range
 * - Calculate APY trends and averages
 * - Export to JSON/CSV
 */

import { Database } from 'better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { YieldPool, ChainYields, YieldScanResult } from '../yields/types.js';

// ============ Types ============

export interface YieldSnapshot {
  id?: number;
  timestamp: number;
  chainId: number;
  chain: string;
  protocol: string;
  project: string;
  pool: string;
  symbol: string;
  apy: number;
  apyBase: number;
  apyReward: number;
  tvlUsd: number;
  riskScore: number | null;
}

export interface YieldHistoryQuery {
  chainId?: number;
  protocol?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
  minApy?: number;
  limit?: number;
  offset?: number;
}

export interface YieldTrend {
  chainId: number;
  chain: string;
  protocol: string;
  avgApy: number;
  minApy: number;
  maxApy: number;
  avgTvl: number;
  dataPoints: number;
  trend: 'up' | 'down' | 'stable';
}

// ============ SQLite Storage Class ============

export class YieldHistoryStorage {
  private db: Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    // Default to data directory
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'yield_history.db');
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize database
    this.db = new BetterSqlite3(this.dbPath);
    this.initializeSchema();
    
    console.log(`[YieldHistory] Database initialized at ${this.dbPath}`);
  }

  /**
   * Create database schema
   */
  private initializeSchema(): void {
    this.db.exec(`
      -- Yield snapshots table
      CREATE TABLE IF NOT EXISTS yield_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        chain_id INTEGER NOT NULL,
        chain TEXT NOT NULL,
        protocol TEXT NOT NULL,
        project TEXT NOT NULL,
        pool TEXT NOT NULL,
        symbol TEXT NOT NULL,
        apy REAL NOT NULL,
        apy_base REAL DEFAULT 0,
        apy_reward REAL DEFAULT 0,
        tvl_usd REAL NOT NULL,
        risk_score INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON yield_snapshots(timestamp);
      CREATE INDEX IF NOT EXISTS idx_snapshots_chain ON yield_snapshots(chain_id);
      CREATE INDEX IF NOT EXISTS idx_snapshots_protocol ON yield_snapshots(protocol);
      CREATE INDEX IF NOT EXISTS idx_snapshots_pool ON yield_snapshots(pool);

      -- Scan metadata table
      CREATE TABLE IF NOT EXISTS scan_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        total_pools INTEGER NOT NULL,
        total_tvl REAL NOT NULL,
        avg_apy REAL NOT NULL,
        chains_scanned INTEGER NOT NULL,
        scan_duration_ms INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_scan_timestamp ON scan_metadata(timestamp);

      -- Best opportunities table (quick lookup)
      CREATE TABLE IF NOT EXISTS best_opportunities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        chain_id INTEGER NOT NULL,
        chain TEXT NOT NULL,
        protocol TEXT NOT NULL,
        project TEXT NOT NULL,
        pool TEXT NOT NULL,
        symbol TEXT NOT NULL,
        apy REAL NOT NULL,
        tvl_usd REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_best_timestamp ON best_opportunities(timestamp);
      CREATE INDEX IF NOT EXISTS idx_best_chain ON best_opportunities(chain_id);
    `);
  }

  /**
   * Store a scan result
   */
  storeScanResult(result: YieldScanResult, durationMs?: number): void {
    const timestamp = result.timestamp;
    
    // Begin transaction for atomic insert
    const transaction = this.db.transaction(() => {
      // Store metadata
      const metaStmt = this.db.prepare(`
        INSERT INTO scan_metadata (timestamp, total_pools, total_tvl, avg_apy, chains_scanned, scan_duration_ms)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      metaStmt.run(
        timestamp,
        result.stats.totalPools,
        result.stats.totalTvl,
        result.stats.avgApy,
        result.stats.chainsScanned,
        durationMs ?? null
      );

      // Store all pools
      const poolStmt = this.db.prepare(`
        INSERT INTO yield_snapshots 
        (timestamp, chain_id, chain, protocol, project, pool, symbol, apy, apy_base, apy_reward, tvl_usd, risk_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const pool of result.allPools) {
        poolStmt.run(
          timestamp,
          pool.chainId,
          pool.chain,
          pool.protocol,
          pool.project,
          pool.pool,
          pool.symbol,
          pool.apy,
          pool.apyBase ?? 0,
          pool.apyReward ?? 0,
          pool.tvlUsd,
          pool.riskScore ?? null
        );
      }

      // Store best opportunity per chain
      const bestStmt = this.db.prepare(`
        INSERT INTO best_opportunities
        (timestamp, chain_id, chain, protocol, project, pool, symbol, apy, tvl_usd)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const [chainId, data] of Object.entries(result.yields)) {
        if (data.bestPool) {
          const pool = data.bestPool;
          bestStmt.run(
            timestamp,
            parseInt(chainId),
            pool.chain,
            pool.protocol,
            pool.project,
            pool.pool,
            pool.symbol,
            pool.apy,
            pool.tvlUsd
          );
        }
      }
    });

    transaction();
    console.log(`[YieldHistory] Stored scan result with ${result.allPools.length} pools`);
  }

  /**
   * Query yield history
   */
  queryHistory(query: YieldHistoryQuery = {}): YieldSnapshot[] {
    let sql = `
      SELECT 
        id, timestamp, chain_id as chainId, chain, protocol, project, 
        pool, symbol, apy, apy_base as apyBase, apy_reward as apyReward,
        tvl_usd as tvlUsd, risk_score as riskScore
      FROM yield_snapshots
      WHERE 1=1
    `;
    const params: any[] = [];

    if (query.chainId !== undefined) {
      sql += ' AND chain_id = ?';
      params.push(query.chainId);
    }

    if (query.protocol) {
      sql += ' AND protocol = ?';
      params.push(query.protocol);
    }

    if (query.fromTimestamp !== undefined) {
      sql += ' AND timestamp >= ?';
      params.push(query.fromTimestamp);
    }

    if (query.toTimestamp !== undefined) {
      sql += ' AND timestamp <= ?';
      params.push(query.toTimestamp);
    }

    if (query.minApy !== undefined) {
      sql += ' AND apy >= ?';
      params.push(query.minApy);
    }

    sql += ' ORDER BY timestamp DESC, apy DESC';

    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }

    if (query.offset) {
      sql += ' OFFSET ?';
      params.push(query.offset);
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as YieldSnapshot[];
  }

  /**
   * Get yield trends for a chain/protocol
   */
  getYieldTrends(
    chainId?: number,
    protocol?: string,
    daysBack: number = 7
  ): YieldTrend[] {
    const fromTimestamp = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
    
    let sql = `
      SELECT 
        chain_id as chainId,
        chain,
        protocol,
        AVG(apy) as avgApy,
        MIN(apy) as minApy,
        MAX(apy) as maxApy,
        AVG(tvl_usd) as avgTvl,
        COUNT(*) as dataPoints,
        (
          SELECT apy FROM yield_snapshots ys2 
          WHERE ys2.chain_id = yield_snapshots.chain_id 
            AND ys2.protocol = yield_snapshots.protocol
          ORDER BY timestamp DESC LIMIT 1
        ) as latestApy,
        (
          SELECT apy FROM yield_snapshots ys3 
          WHERE ys3.chain_id = yield_snapshots.chain_id 
            AND ys3.protocol = yield_snapshots.protocol
          ORDER BY timestamp ASC LIMIT 1
        ) as earliestApy
      FROM yield_snapshots
      WHERE timestamp >= ?
    `;
    const params: any[] = [fromTimestamp];

    if (chainId !== undefined) {
      sql += ' AND chain_id = ?';
      params.push(chainId);
    }

    if (protocol) {
      sql += ' AND protocol = ?';
      params.push(protocol);
    }

    sql += ' GROUP BY chain_id, protocol ORDER BY avgApy DESC';

    const stmt = this.db.prepare(sql);
    const results = stmt.all(...params) as any[];

    return results.map(row => ({
      chainId: row.chainId,
      chain: row.chain,
      protocol: row.protocol,
      avgApy: row.avgApy,
      minApy: row.minApy,
      maxApy: row.maxApy,
      avgTvl: row.avgTvl,
      dataPoints: row.dataPoints,
      trend: this.calculateTrend(row.earliestApy, row.latestApy),
    }));
  }

  /**
   * Get best opportunities over time
   */
  getBestOpportunitiesHistory(
    chainId?: number,
    daysBack: number = 7
  ): YieldSnapshot[] {
    const fromTimestamp = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
    
    let sql = `
      SELECT 
        timestamp, chain_id as chainId, chain, protocol, project,
        pool, symbol, apy, tvl_usd as tvlUsd
      FROM best_opportunities
      WHERE timestamp >= ?
    `;
    const params: any[] = [fromTimestamp];

    if (chainId !== undefined) {
      sql += ' AND chain_id = ?';
      params.push(chainId);
    }

    sql += ' ORDER BY timestamp DESC';

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as YieldSnapshot[];
  }

  /**
   * Get latest scan metadata
   */
  getLatestScanMetadata(): {
    timestamp: number;
    totalPools: number;
    totalTvl: number;
    avgApy: number;
    chainsScanned: number;
    scanDurationMs: number | null;
  } | null {
    const stmt = this.db.prepare(`
      SELECT timestamp, total_pools as totalPools, total_tvl as totalTvl,
             avg_apy as avgApy, chains_scanned as chainsScanned,
             scan_duration_ms as scanDurationMs
      FROM scan_metadata
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    
    return stmt.get() as any ?? null;
  }

  /**
   * Calculate trend direction
   */
  private calculateTrend(
    earliestApy: number,
    latestApy: number
  ): 'up' | 'down' | 'stable' {
    const change = latestApy - earliestApy;
    const threshold = 0.1; // 0.1% threshold for "stable"
    
    if (change > threshold) return 'up';
    if (change < -threshold) return 'down';
    return 'stable';
  }

  /**
   * Export history to JSON
   */
  exportToJson(query: YieldHistoryQuery = {}): string {
    const history = this.queryHistory(query);
    return JSON.stringify(history, null, 2);
  }

  /**
   * Export history to CSV
   */
  exportToCsv(query: YieldHistoryQuery = {}): string {
    const history = this.queryHistory(query);
    
    if (history.length === 0) return '';

    const headers = Object.keys(history[0]).join(',');
    const rows = history.map(row => 
      Object.values(row).map(v => 
        typeof v === 'string' ? `"${v}"` : v
      ).join(',')
    );

    return [headers, ...rows].join('\n');
  }

  /**
   * Get database statistics
   */
  getStats(): {
    totalSnapshots: number;
    totalScans: number;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
    dbSizeKB: number;
  } {
    const snapshotCount = this.db.prepare('SELECT COUNT(*) as count FROM yield_snapshots').get() as any;
    const scanCount = this.db.prepare('SELECT COUNT(*) as count FROM scan_metadata').get() as any;
    const oldest = this.db.prepare('SELECT MIN(timestamp) as ts FROM yield_snapshots').get() as any;
    const newest = this.db.prepare('SELECT MAX(timestamp) as ts FROM yield_snapshots').get() as any;
    
    const stats = fs.statSync(this.dbPath);
    
    return {
      totalSnapshots: snapshotCount.count,
      totalScans: scanCount.count,
      oldestTimestamp: oldest.ts,
      newestTimestamp: newest.ts,
      dbSizeKB: Math.round(stats.size / 1024),
    };
  }

  /**
   * Cleanup old data (retention policy)
   */
  cleanup(retentionDays: number = 30): number {
    const cutoffTimestamp = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    
    const result = this.db.prepare(`
      DELETE FROM yield_snapshots WHERE timestamp < ?
    `).run(cutoffTimestamp);
    
    this.db.prepare(`
      DELETE FROM best_opportunities WHERE timestamp < ?
    `).run(cutoffTimestamp);
    
    this.db.prepare(`
      DELETE FROM scan_metadata WHERE timestamp < ?
    `).run(cutoffTimestamp);
    
    // Vacuum to reclaim space
    this.db.exec('VACUUM');
    
    console.log(`[YieldHistory] Cleaned up ${result.changes} old records`);
    return result.changes;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    console.log('[YieldHistory] Database connection closed');
  }
}

// ============ Singleton Instance ============

let storageInstance: YieldHistoryStorage | null = null;

export function getYieldHistoryStorage(dbPath?: string): YieldHistoryStorage {
  if (!storageInstance) {
    storageInstance = new YieldHistoryStorage(dbPath);
  }
  return storageInstance;
}

// ============ Exports ============

export default YieldHistoryStorage;

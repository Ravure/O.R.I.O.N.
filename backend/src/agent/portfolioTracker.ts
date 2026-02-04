/**
 * ORION Portfolio Tracker
 * 
 * Tracks user positions across all chains and calculates P&L.
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
  Position,
  Portfolio,
  PortfolioSnapshot,
  StoredPosition,
} from './types.js';
import { SUPPORTED_CHAINS, SupportedChainId } from './config.js';

export class PortfolioTracker {
  private db: Database.Database;
  private dbPath: string;
  private positions: Map<string, Position> = new Map();
  private lastSync: number = 0;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || './data/orion_portfolio.db';
    this.db = new Database(this.dbPath);
    this.initializeSchema();
    this.loadPositions();
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS positions (
        id TEXT PRIMARY KEY,
        chain_id INTEGER NOT NULL,
        chain_name TEXT NOT NULL,
        protocol TEXT NOT NULL,
        pool TEXT NOT NULL,
        symbol TEXT NOT NULL,
        balance REAL NOT NULL,
        entry_apy REAL NOT NULL,
        current_apy REAL NOT NULL,
        entry_timestamp INTEGER NOT NULL,
        last_updated INTEGER NOT NULL,
        unrealized_pnl REAL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        total_value REAL NOT NULL,
        total_pnl REAL NOT NULL,
        position_count INTEGER NOT NULL,
        snapshot_json TEXT
      );

      CREATE TABLE IF NOT EXISTS trade_history (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        from_chain INTEGER,
        to_chain INTEGER,
        from_protocol TEXT,
        to_protocol TEXT,
        amount REAL NOT NULL,
        cost REAL DEFAULT 0,
        pnl REAL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_positions_chain ON positions(chain_id);
      CREATE INDEX IF NOT EXISTS idx_positions_protocol ON positions(protocol);
      CREATE INDEX IF NOT EXISTS idx_snapshots_time ON portfolio_snapshots(timestamp);
    `);
  }

  /**
   * Load positions from database
   */
  private loadPositions(): void {
    const rows = this.db.prepare('SELECT * FROM positions').all() as StoredPosition[];
    
    for (const row of rows) {
      this.positions.set(row.id, {
        id: row.id,
        chainId: row.chain_id,
        chainName: row.chain_name,
        protocol: row.protocol,
        pool: row.pool,
        symbol: row.symbol,
        balance: row.balance,
        entryApy: row.entry_apy,
        currentApy: row.current_apy,
        entryTimestamp: row.entry_timestamp,
        lastUpdated: row.last_updated,
        unrealizedPnl: row.unrealized_pnl,
      });
    }
  }

  /**
   * Get current portfolio
   */
  getCurrentPortfolio(): Portfolio {
    const positions = Array.from(this.positions.values());
    const totalValue = positions.reduce((sum, p) => sum + p.balance, 0);
    const totalPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    
    // Calculate chain exposure
    const chainExposure = new Map<number, number>();
    for (const position of positions) {
      const current = chainExposure.get(position.chainId) || 0;
      chainExposure.set(position.chainId, current + (position.balance / totalValue || 0));
    }
    
    // Calculate protocol exposure
    const protocolExposure = new Map<string, number>();
    for (const position of positions) {
      const current = protocolExposure.get(position.protocol) || 0;
      protocolExposure.set(position.protocol, current + (position.balance / totalValue || 0));
    }
    
    return {
      positions,
      totalValue,
      totalPnl,
      chainExposure,
      protocolExposure,
      lastUpdated: this.lastSync || Date.now(),
    };
  }

  /**
   * Add or update a position
   */
  addPosition(params: {
    chainId: number;
    protocol: string;
    pool: string;
    symbol: string;
    balance: number;
    apy: number;
  }): Position {
    const id = uuidv4();
    const chainName = SUPPORTED_CHAINS[params.chainId as SupportedChainId]?.name || `Chain ${params.chainId}`;
    const now = Date.now();
    
    const position: Position = {
      id,
      chainId: params.chainId,
      chainName,
      protocol: params.protocol,
      pool: params.pool,
      symbol: params.symbol,
      balance: params.balance,
      entryApy: params.apy,
      currentApy: params.apy,
      entryTimestamp: now,
      lastUpdated: now,
      unrealizedPnl: 0,
    };
    
    this.positions.set(id, position);
    this.savePosition(position);
    
    return position;
  }

  /**
   * Update an existing position
   */
  updatePosition(id: string, updates: Partial<Position>): Position | null {
    const position = this.positions.get(id);
    if (!position) return null;
    
    const updated: Position = {
      ...position,
      ...updates,
      lastUpdated: Date.now(),
    };
    
    if (updates.unrealizedPnl !== undefined) {
      updated.unrealizedPnl = updates.unrealizedPnl;
    }
    
    this.positions.set(id, updated);
    this.savePosition(updated);
    
    return updated;
  }

  /**
   * Remove a position
   */
  removePosition(id: string): boolean {
    const exists = this.positions.delete(id);
    if (exists) {
      this.db.prepare('DELETE FROM positions WHERE id = ?').run(id);
    }
    return exists;
  }

  /**
   * Update position balance after trade
   */
  recordTrade(params: {
    positionId?: string;
    actionType: 'deposit' | 'withdraw' | 'rebalance' | 'bridge';
    fromChain?: number;
    toChain?: number;
    fromProtocol?: string;
    toProtocol?: string;
    amount: number;
    cost?: number;
    pnl?: number;
  }): void {
    const id = uuidv4();
    
    this.db.prepare(`
      INSERT INTO trade_history (
        id, timestamp, action_type, from_chain, to_chain,
        from_protocol, to_protocol, amount, cost, pnl
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      Date.now(),
      params.actionType,
      params.fromChain || null,
      params.toChain || null,
      params.fromProtocol || null,
      params.toProtocol || null,
      params.amount,
      params.cost || 0,
      params.pnl || 0
    );
    
    // Update position balance if specified
    if (params.positionId) {
      const position = this.positions.get(params.positionId);
      if (position) {
        // NOTE: 'rebalance' and 'bridge' move funds OUT of the current position.
        // The destination position is tracked separately by the caller (executor/orchestrator).
        const isOutflow =
          params.actionType === 'withdraw' ||
          params.actionType === 'rebalance' ||
          params.actionType === 'bridge';

        const newBalance = isOutflow
          ? position.balance - params.amount
          : position.balance + params.amount;
        
        if (newBalance <= 0) {
          this.removePosition(params.positionId);
        } else {
          this.updatePosition(params.positionId, { balance: newBalance });
        }
      }
    }
  }

  /**
   * Accrue yield on all positions since last update.
   * Uses current APY as the accrual rate for the elapsed period.
   */
  accrueYield(now: number = Date.now(), timeScale: number = 1): void {
    const msPerDay = 1000 * 60 * 60 * 24;
    for (const [id, position] of this.positions.entries()) {
      if (position.balance <= 0 || position.currentApy <= 0) continue;

      const elapsedDays = (now - position.lastUpdated) / msPerDay;
      if (elapsedDays <= 0) continue;

      const scaledElapsedDays = elapsedDays * timeScale;
      const accrued = position.balance * (position.currentApy / 100 / 365) * scaledElapsedDays;
      const updated: Position = {
        ...position,
        unrealizedPnl: position.unrealizedPnl + accrued,
        lastUpdated: now,
      };

      this.positions.set(id, updated);
      this.savePosition(updated);
    }
  }

  /**
   * Save position to database
   */
  private savePosition(position: Position): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO positions (
        id, chain_id, chain_name, protocol, pool, symbol,
        balance, entry_apy, current_apy, entry_timestamp,
        last_updated, unrealized_pnl
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      position.id,
      position.chainId,
      position.chainName,
      position.protocol,
      position.pool,
      position.symbol,
      position.balance,
      position.entryApy,
      position.currentApy,
      position.entryTimestamp,
      position.lastUpdated,
      position.unrealizedPnl
    );
  }

  /**
   * Take a snapshot of current portfolio
   */
  takeSnapshot(): PortfolioSnapshot {
    const portfolio = this.getCurrentPortfolio();
    const topPosition = portfolio.positions.length > 0
      ? portfolio.positions.reduce((a, b) => a.balance > b.balance ? a : b)
      : null;
    
    const snapshot: PortfolioSnapshot = {
      timestamp: Date.now(),
      totalValue: portfolio.totalValue,
      totalPnl: portfolio.totalPnl,
      positionCount: portfolio.positions.length,
      topPosition,
    };
    
    this.db.prepare(`
      INSERT INTO portfolio_snapshots (
        timestamp, total_value, total_pnl, position_count, snapshot_json
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      snapshot.timestamp,
      snapshot.totalValue,
      snapshot.totalPnl,
      snapshot.positionCount,
      JSON.stringify(portfolio.positions)
    );
    
    return snapshot;
  }

  /**
   * Get chain exposure as percentage
   */
  getChainExposure(): Map<number, { name: string; percentage: number; value: number }> {
    const portfolio = this.getCurrentPortfolio();
    const result = new Map();
    
    for (const [chainId, percentage] of portfolio.chainExposure) {
      const chainInfo = SUPPORTED_CHAINS[chainId as SupportedChainId];
      result.set(chainId, {
        name: chainInfo?.name || `Chain ${chainId}`,
        percentage: percentage * 100,
        value: percentage * portfolio.totalValue,
      });
    }
    
    return result;
  }

  /**
   * Get protocol exposure as percentage
   */
  getProtocolExposure(): Map<string, { percentage: number; value: number }> {
    const portfolio = this.getCurrentPortfolio();
    const result = new Map();
    
    for (const [protocol, percentage] of portfolio.protocolExposure) {
      result.set(protocol, {
        percentage: percentage * 100,
        value: percentage * portfolio.totalValue,
      });
    }
    
    return result;
  }

  /**
   * Calculate total P&L
   */
  calculatePnL(): {
    totalPnl: number;
    realizedPnl: number;
    unrealizedPnl: number;
    tradingCosts: number;
  } {
    // Get realized P&L from trade history
    const tradeStats = this.db.prepare(`
      SELECT 
        COALESCE(SUM(pnl), 0) as realized_pnl,
        COALESCE(SUM(cost), 0) as trading_costs
      FROM trade_history
    `).get() as { realized_pnl: number; trading_costs: number };
    
    // Get unrealized P&L from positions
    const portfolio = this.getCurrentPortfolio();
    
    return {
      totalPnl: tradeStats.realized_pnl + portfolio.totalPnl - tradeStats.trading_costs,
      realizedPnl: tradeStats.realized_pnl,
      unrealizedPnl: portfolio.totalPnl,
      tradingCosts: tradeStats.trading_costs,
    };
  }

  /**
   * Get positions by chain
   */
  getPositionsByChain(chainId: number): Position[] {
    return Array.from(this.positions.values())
      .filter(p => p.chainId === chainId);
  }

  /**
   * Get positions by protocol
   */
  getPositionsByProtocol(protocol: string): Position[] {
    return Array.from(this.positions.values())
      .filter(p => p.protocol.toLowerCase().includes(protocol.toLowerCase()));
  }

  /**
   * Update all position APYs from yield data
   */
  updateApysFromYieldData(yieldData: Map<string, number>): number {
    let updated = 0;
    
    for (const [id, position] of this.positions) {
      const key = `${position.chainId}-${position.protocol}-${position.pool}`.toLowerCase();
      const newApy = yieldData.get(key);
      
      if (newApy !== undefined && newApy !== position.currentApy) {
        this.updatePosition(id, { currentApy: newApy });
        updated++;
      }
    }
    
    return updated;
  }

  /**
   * Get historical snapshots
   */
  getSnapshots(daysBack: number = 7): PortfolioSnapshot[] {
    const since = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
    
    const rows = this.db.prepare(`
      SELECT * FROM portfolio_snapshots
      WHERE timestamp > ?
      ORDER BY timestamp ASC
    `).all(since) as any[];
    
    return rows.map(row => ({
      timestamp: row.timestamp,
      totalValue: row.total_value,
      totalPnl: row.total_pnl,
      positionCount: row.position_count,
      topPosition: null,
    }));
  }

  /**
   * Get trade history
   */
  getTradeHistory(limit: number = 50): any[] {
    return this.db.prepare(`
      SELECT * FROM trade_history
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Clear all positions (for testing)
   */
  clearAll(): void {
    this.positions.clear();
    this.db.exec('DELETE FROM positions');
    this.db.exec('DELETE FROM portfolio_snapshots');
    this.db.exec('DELETE FROM trade_history');
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Sync with external balance data
   */
  async syncWithYellowNetwork(balances: { asset: string; amount: string }[]): Promise<void> {
    for (const balance of balances) {
      const amount = parseInt(balance.amount) / 1_000_000; // Assume 6 decimals
      
      // Find existing position or create new one
      const existing = Array.from(this.positions.values())
        .find(p => p.symbol.toLowerCase() === balance.asset.toLowerCase());
      
      if (existing) {
        this.updatePosition(existing.id, { balance: amount });
      } else if (amount > 0) {
        this.addPosition({
          chainId: 11155111, // Sepolia for Yellow Network
          protocol: 'yellow-network',
          pool: 'state-channel',
          symbol: balance.asset,
          balance: amount,
          apy: 0, // Yellow Network doesn't have APY
        });
      }
    }
    
    this.lastSync = Date.now();
  }
}

// Singleton instance
let portfolioTracker: PortfolioTracker | null = null;

export function getPortfolioTracker(dbPath?: string): PortfolioTracker {
  if (!portfolioTracker) {
    portfolioTracker = new PortfolioTracker(dbPath);
  }
  return portfolioTracker;
}

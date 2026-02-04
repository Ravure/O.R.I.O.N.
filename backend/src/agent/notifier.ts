/**
 * ORION Notification System
 * 
 * Sends alerts via console and Telegram.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Notification,
  NotificationLevel,
  NotificationConfig,
  RebalanceOpportunity,
  ExecutionResult,
  Portfolio,
  AgentStatus,
} from './types.js';

// ANSI color codes for console
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const LEVEL_COLORS: Record<NotificationLevel, string> = {
  info: COLORS.blue,
  success: COLORS.green,
  warning: COLORS.yellow,
  error: COLORS.red,
  critical: COLORS.red + COLORS.bright,
};

const LEVEL_EMOJI: Record<NotificationLevel, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌',
  critical: '🚨',
};

export class Notifier {
  private config: NotificationConfig;
  private history: Notification[] = [];
  private maxHistory: number = 100;

  constructor(config: NotificationConfig) {
    this.config = config;
  }

  /**
   * Send a notification
   */
  async notify(
    level: NotificationLevel,
    title: string,
    message: string,
    data?: Record<string, any>
  ): Promise<void> {
    // Check minimum level
    if (!this.shouldNotify(level)) return;

    const notification: Notification = {
      id: uuidv4(),
      timestamp: Date.now(),
      level,
      title,
      message,
      data,
      channels: [],
    };

    // Console notification
    if (this.config.enableConsole) {
      this.notifyConsole(notification);
      notification.channels.push('console');
    }

    // Telegram notification
    if (this.config.enableTelegram && this.config.telegramBotToken && this.config.telegramChatId) {
      try {
        await this.notifyTelegram(notification);
        notification.channels.push('telegram');
      } catch (error: any) {
        console.error('Telegram notification failed:', error.message);
      }
    }

    // Store in history
    this.history.push(notification);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * Check if notification should be sent based on level
   */
  private shouldNotify(level: NotificationLevel): boolean {
    const levels: NotificationLevel[] = ['info', 'success', 'warning', 'error', 'critical'];
    const minIndex = levels.indexOf(this.config.minLevel);
    const currentIndex = levels.indexOf(level);
    return currentIndex >= minIndex;
  }

  /**
   * Send console notification
   */
  private notifyConsole(notification: Notification): void {
    const timestamp = new Date(notification.timestamp).toLocaleTimeString();
    const color = LEVEL_COLORS[notification.level];
    const emoji = LEVEL_EMOJI[notification.level];
    
    console.log(
      `${COLORS.dim}[${timestamp}]${COLORS.reset} ` +
      `${color}${emoji} ${notification.title}${COLORS.reset}`
    );
    
    if (notification.message) {
      console.log(`   ${notification.message}`);
    }
    
    if (notification.data && Object.keys(notification.data).length > 0) {
      for (const [key, value] of Object.entries(notification.data)) {
        console.log(`   ${COLORS.dim}${key}:${COLORS.reset} ${value}`);
      }
    }
  }

  /**
   * Send Telegram notification
   */
  private async notifyTelegram(notification: Notification): Promise<void> {
    const emoji = LEVEL_EMOJI[notification.level];
    let text = `${emoji} *${notification.title}*\n\n${notification.message}`;
    
    if (notification.data && Object.keys(notification.data).length > 0) {
      text += '\n\n*Details:*';
      for (const [key, value] of Object.entries(notification.data)) {
        text += `\n• ${key}: \`${value}\``;
      }
    }
    
    const url = `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.config.telegramChatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.status}`);
    }
  }

  // ============ Convenience Methods ============

  /**
   * Notify about agent start
   */
  async notifyAgentStarted(config: { riskProfile: string }): Promise<void> {
    await this.notify('success', 'ORION Agent Started', 'Autonomous yield hunting is now active', {
      'Risk Profile': config.riskProfile,
      'Started At': new Date().toLocaleString(),
    });
  }

  /**
   * Notify about agent stop
   */
  async notifyAgentStopped(reason: string): Promise<void> {
    await this.notify('warning', 'ORION Agent Stopped', reason, {
      'Stopped At': new Date().toLocaleString(),
    });
  }

  /**
   * Notify about opportunity found
   */
  async notifyOpportunityFound(opportunity: RebalanceOpportunity): Promise<void> {
    await this.notify('info', 'New Opportunity Found', opportunity.reason, {
      'APY Gain': `+${opportunity.apyGain.toFixed(1)}%`,
      'Amount': `$${opportunity.amount.toFixed(2)}`,
      'Net Benefit': `$${opportunity.netBenefit.toFixed(2)}/day`,
      'Priority': `${opportunity.priority}/100`,
    });
  }

  /**
   * Notify about execution result
   */
  async notifyExecutionResult(result: ExecutionResult): Promise<void> {
    const level: NotificationLevel = result.success ? 'success' : 'error';
    const title = result.success ? 'Rebalance Executed' : 'Rebalance Failed';
    
    const successCount = result.executions.filter(e => e.status === 'completed').length;
    
    await this.notify(level, title, `${successCount}/${result.executions.length} trades completed`, {
      'Total Cost': `$${result.totalCost.toFixed(2)}`,
      'Total Received': `$${result.totalReceived.toFixed(2)}`,
      ...(result.errors.length > 0 && { 'Errors': result.errors.join(', ') }),
    });
  }

  /**
   * Notify about portfolio update
   */
  async notifyPortfolioUpdate(portfolio: Portfolio): Promise<void> {
    await this.notify('info', 'Portfolio Updated', `${portfolio.positions.length} active positions`, {
      'Total Value': `$${portfolio.totalValue.toFixed(2)}`,
      'Total P&L': `$${portfolio.totalPnl.toFixed(2)}`,
    });
  }

  /**
   * Notify about error
   */
  async notifyError(error: string, context?: string): Promise<void> {
    await this.notify('error', 'Error Occurred', error, {
      ...(context && { 'Context': context }),
      'Time': new Date().toLocaleString(),
    });
  }

  /**
   * Notify critical issue
   */
  async notifyCritical(title: string, message: string, data?: Record<string, any>): Promise<void> {
    await this.notify('critical', title, message, data);
  }

  /**
   * Send daily summary
   */
  async sendDailySummary(status: AgentStatus, portfolio: Portfolio): Promise<void> {
    const uptime = Math.round(status.uptime / 3600);
    
    await this.notify('info', 'Daily Summary', `ORION has been running for ${uptime} hours`, {
      'Scans': status.scanCount.toString(),
      'Actions': status.actionCount.toString(),
      'Total P&L': `$${status.totalPnl.toFixed(2)}`,
      'Portfolio Value': `$${portfolio.totalValue.toFixed(2)}`,
      'Positions': portfolio.positions.length.toString(),
    });
  }

  /**
   * Get notification history
   */
  getHistory(limit?: number): Notification[] {
    const history = [...this.history].reverse();
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Clear notification history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Test Telegram connection
   */
  async testTelegram(): Promise<boolean> {
    if (!this.config.telegramBotToken || !this.config.telegramChatId) {
      console.log('Telegram not configured');
      return false;
    }
    
    try {
      await this.notify('info', 'Test Notification', 'ORION Telegram connection is working!');
      return true;
    } catch (error) {
      console.error('Telegram test failed:', error);
      return false;
    }
  }
}

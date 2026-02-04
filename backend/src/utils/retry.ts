/**
 * Retry Utility with Exponential Backoff
 * Provides resilient execution of operations that may fail temporarily
 * 
 * Features:
 * - Exponential backoff with jitter
 * - Configurable retry attempts
 * - Custom error filtering (retry only specific errors)
 * - Progress callbacks
 */

// ============ Types ============

export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay between retries in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier (e.g., 2 for doubling) */
  backoffMultiplier: number;
  /** Add random jitter to prevent thundering herd */
  jitter: boolean;
  /** Optional: Only retry on specific error types */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Callback when a retry happens */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalTimeMs: number;
}

// ============ Default Configuration ============

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

// ============ Retry Function ============

/**
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const cfg: RetryConfig = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt <= cfg.maxRetries) {
    try {
      const result = await fn();
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if we should retry this error
      if (cfg.shouldRetry && !cfg.shouldRetry(error, attempt)) {
        throw lastError;
      }
      
      // Check if we've exhausted retries
      if (attempt >= cfg.maxRetries) {
        break;
      }
      
      // Calculate delay with exponential backoff
      let delay = cfg.initialDelayMs * Math.pow(cfg.backoffMultiplier, attempt);
      delay = Math.min(delay, cfg.maxDelayMs);
      
      // Add jitter (0-25% of delay)
      if (cfg.jitter) {
        delay += Math.random() * delay * 0.25;
      }
      
      // Notify about retry
      cfg.onRetry?.(error, attempt + 1, delay);
      
      // Wait before next attempt
      await sleep(delay);
      attempt++;
    }
  }

  // All retries exhausted
  const totalTime = Date.now() - startTime;
  const errorMessage = `Operation failed after ${attempt + 1} attempts (${totalTime}ms): ${lastError?.message}`;
  throw new RetryExhaustedError(errorMessage, attempt + 1, totalTime, lastError);
}

/**
 * Execute a function with retry and return detailed result
 */
export async function withRetryResult<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let attempts = 0;
  
  try {
    const result = await withRetry(fn, {
      ...config,
      onRetry: (error, attempt, delay) => {
        attempts = attempt;
        config.onRetry?.(error, attempt, delay);
      },
    });
    
    return {
      success: true,
      result,
      attempts: attempts + 1,
      totalTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      attempts: error instanceof RetryExhaustedError ? error.attempts : attempts + 1,
      totalTimeMs: Date.now() - startTime,
    };
  }
}

// ============ Error Classes ============

export class RetryExhaustedError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly totalTimeMs: number,
    public readonly lastError: Error | null
  ) {
    super(message);
    this.name = 'RetryExhaustedError';
  }
}

// ============ Helper Functions ============

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  
  const message = error.message.toLowerCase();
  
  // Network errors - usually retryable
  const retryablePatterns = [
    'timeout',
    'connection',
    'network',
    'econnrefused',
    'econnreset',
    'socket',
    'temporary',
    'unavailable',
    'service',
    '503',
    '502',
    '504',
    'rate limit',
    '429',
  ];
  
  // Non-retryable errors
  const nonRetryablePatterns = [
    'invalid',
    'unauthorized',
    '401',
    'forbidden',
    '403',
    'not found',
    '404',
    'bad request',
    '400',
    'insufficient',
    'rejected',
  ];
  
  // Check non-retryable first
  if (nonRetryablePatterns.some(p => message.includes(p))) {
    return false;
  }
  
  // Check retryable patterns
  if (retryablePatterns.some(p => message.includes(p))) {
    return true;
  }
  
  // Default: retry unknown errors
  return true;
}

// ============ Pre-configured Retry Configs ============

/**
 * Configuration for network operations
 */
export const NETWORK_RETRY_CONFIG: Partial<RetryConfig> = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  shouldRetry: isRetryableError,
};

/**
 * Configuration for trade operations
 */
export const TRADE_RETRY_CONFIG: Partial<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitter: true,
  shouldRetry: (error: unknown) => {
    // Don't retry insufficient balance errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('insufficient') || message.includes('balance')) {
        return false;
      }
    }
    return isRetryableError(error);
  },
};

/**
 * Configuration for WebSocket operations
 */
export const WEBSOCKET_RETRY_CONFIG: Partial<RetryConfig> = {
  maxRetries: 5,
  initialDelayMs: 2000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  jitter: true,
  shouldRetry: isRetryableError,
};

// ============ Exports ============

export default withRetry;

/**
 * Rate Limiter Utility
 * Implements token bucket algorithm for API rate limiting
 * 
 * Features:
 * - Configurable requests per second
 * - Automatic token refill
 * - Queue-based request handling
 * - Backoff on rate limit errors
 */

// ============ Types ============

export interface RateLimiterConfig {
  /** Maximum requests per second */
  maxRequestsPerSecond: number;
  /** Maximum burst size (tokens in bucket) */
  maxBurst?: number;
  /** Name for logging purposes */
  name: string;
}

interface QueuedRequest<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  addedAt: number;
}

// ============ Rate Limiter Class ============

export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per ms
  private lastRefill: number;
  private queue: QueuedRequest<any>[] = [];
  private processing: boolean = false;
  private name: string;

  constructor(config: RateLimiterConfig) {
    this.maxTokens = config.maxBurst ?? config.maxRequestsPerSecond * 2;
    this.tokens = this.maxTokens;
    this.refillRate = config.maxRequestsPerSecond / 1000; // per ms
    this.lastRefill = Date.now();
    this.name = config.name;
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        execute: fn,
        resolve,
        reject,
        addedAt: Date.now(),
      });
      this.processQueue();
    });
  }

  /**
   * Process the request queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      // Refill tokens
      this.refillTokens();

      // Check if we have tokens available
      if (this.tokens < 1) {
        // Calculate wait time for next token
        const waitTime = Math.ceil((1 - this.tokens) / this.refillRate);
        await this.sleep(waitTime);
        this.refillTokens();
      }

      // Take a token and process request
      this.tokens -= 1;
      const request = this.queue.shift()!;
      
      const queueTime = Date.now() - request.addedAt;
      if (queueTime > 100) {
        console.log(`[RateLimit:${this.name}] Request waited ${queueTime}ms in queue`);
      }

      try {
        const result = await request.execute();
        request.resolve(result);
      } catch (error) {
        // Check if it's a rate limit error
        if (this.isRateLimitError(error)) {
          console.warn(`[RateLimit:${this.name}] Rate limit hit, backing off...`);
          // Empty all tokens and wait
          this.tokens = 0;
          await this.sleep(1000); // Wait 1 second on rate limit
          // Re-queue the request
          this.queue.unshift(request);
        } else {
          request.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }

    this.processing = false;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }

  /**
   * Check if an error is a rate limit error
   */
  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('rate limit') ||
        message.includes('too many requests') ||
        message.includes('429')
      );
    }
    return false;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Get available tokens
   */
  getAvailableTokens(): number {
    this.refillTokens();
    return Math.floor(this.tokens);
  }
}

// ============ Pre-configured Rate Limiters ============

/**
 * DeFiLlama rate limiter
 * Docs say 10 req/sec but we use 8 to be safe
 */
export const defiLlamaRateLimiter = new RateLimiter({
  name: 'DeFiLlama',
  maxRequestsPerSecond: 8,
  maxBurst: 15,
});

/**
 * LI.FI API rate limiter
 * Using 5 req/sec to be conservative
 */
export const lifiRateLimiter = new RateLimiter({
  name: 'LI.FI',
  maxRequestsPerSecond: 5,
  maxBurst: 10,
});

/**
 * Generic fetch with rate limiting
 */
export async function rateLimitedFetch(
  limiter: RateLimiter,
  url: string,
  options?: RequestInit
): Promise<Response> {
  return limiter.execute(async () => {
    const response = await fetch(url, options);
    
    // Check for rate limit response
    if (response.status === 429) {
      throw new Error('Rate limit exceeded (429)');
    }
    
    return response;
  });
}

// ============ Exports ============

export default RateLimiter;

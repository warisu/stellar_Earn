import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  keys: number;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly namespace: string;
  private hits = 0;
  private misses = 0;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {
    this.namespace = this.configService.get<string>('cache.namespace', 'app');
  }

  /**
   * Build a namespaced cache key.
   */
  buildKey(key: string, prefix?: string): string {
    const parts = [this.namespace, prefix, key].filter(Boolean);
    return parts.join(':');
  }

  /**
   * Get a value from cache. Returns null on miss.
   */
  async get<T>(key: string, prefix?: string): Promise<T | null> {
    const fullKey = this.buildKey(key, prefix);
    try {
      const value = await this.cacheManager.get<T>(fullKey);
      if (value !== undefined && value !== null) {
        this.hits++;
        this.logger.debug(`Cache HIT: ${fullKey}`);
        return value;
      }
      this.misses++;
      this.logger.debug(`Cache MISS: ${fullKey}`);
      return null;
    } catch (err) {
      this.logger.warn(`Cache GET error for key "${fullKey}": ${err.message}`);
      return null;
    }
  }

  /**
   * Set a value in cache with optional TTL (seconds).
   */
  async set<T>(key: string, value: T, ttl?: number, prefix?: string): Promise<void> {
    const fullKey = this.buildKey(key, prefix);
    const defaultTtl = this.configService.get<number>('cache.ttl', 300);
    try {
      await this.cacheManager.set(fullKey, value, ttl ?? defaultTtl);
      this.logger.debug(`Cache SET: ${fullKey} (TTL: ${ttl ?? defaultTtl}s)`);
    } catch (err) {
      this.logger.warn(`Cache SET error for key "${fullKey}": ${err.message}`);
    }
  }

  /**
   * Delete a specific key from cache.
   */
  async delete(key: string, prefix?: string): Promise<void> {
    const fullKey = this.buildKey(key, prefix);
    try {
      await this.cacheManager.del(fullKey);
      this.logger.debug(`Cache DELETE: ${fullKey}`);
    } catch (err) {
      this.logger.warn(`Cache DELETE error for key "${fullKey}": ${err.message}`);
    }
  }

  /**
   * Invalidate all keys matching a prefix pattern.
   */
  async invalidatePrefix(prefix: string): Promise<void> {
    const pattern = this.buildKey('*', prefix);
    try {
      // cache-manager-ioredis exposes the underlying client
      const store = (this.cacheManager as any).store;
      if (store && typeof store.keys === 'function') {
        const keys: string[] = await store.keys(pattern);
        if (keys.length > 0) {
          await Promise.all(keys.map((k) => this.cacheManager.del(k)));
          this.logger.log(`Invalidated ${keys.length} keys matching "${pattern}"`);
        }
      } else {
        this.logger.warn('Cache store does not support key scanning; skipping prefix invalidation.');
      }
    } catch (err) {
      this.logger.warn(`Cache invalidatePrefix error for "${pattern}": ${err.message}`);
    }
  }

  /**
   * Get-or-set pattern: fetch from cache, fall back to factory, then cache the result.
   */
  async wrap<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number,
    prefix?: string,
  ): Promise<T> {
    const cached = await this.get<T>(key, prefix);
    if (cached !== null) {
      return cached;
    }
    const fresh = await factory();
    await this.set(key, fresh, ttl, prefix);
    return fresh;
  }

  /**
   * Reset cache statistics counters.
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Return current cache statistics.
   */
  getStats(key?: string): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? Math.round((this.hits / total) * 10000) / 100 : 0,
      keys: total,
    };
  }

  /**
   * Flush the entire cache. Use with care in production.
   */
  async flush(): Promise<void> {
    try {
      await (this.cacheManager as any).reset();
      this.logger.warn('Cache flushed entirely.');
    } catch (err) {
      this.logger.warn(`Cache flush error: ${err.message}`);
    }
  }

  /**
   * Clear all cache (alias for flush).
   */
  async clear(): Promise<void> {
    return this.flush();
  }

  /**
   * Delete pattern or prefix from cache (alias for invalidatePrefix).
   */
  async deletePattern(pattern: string): Promise<void> {
    return this.invalidatePrefix(pattern);
  }
}
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * RateLimitService
 * 
 * Implements rate limiting for pairing attempts to prevent brute-force attacks.
 * 
 * Key responsibilities:
 * - Track failed pairing attempts using Redis Sorted Set (sliding window)
 * - Ban app sessions that exceed the failure threshold
 * - Automatically unban sessions after the ban duration expires
 * - Reset counters on successful pairing
 * 
 * Rate Limiting Strategy:
 * - Window: 1 minute (60 seconds)
 * - Max attempts: 5 failed attempts per window
 * - Ban duration: 5 minutes (300 seconds)
 * 
 * Redis Key Design:
 * - ratelimit:attempts:{appSessionId} -> Sorted Set (score: timestamp, member: attempt ID)
 * - ratelimit:ban:{appSessionId} -> String (banned until timestamp)
 * 
 * Implementation Details:
 * - Uses Redis Sorted Set with timestamps as scores for sliding window
 * - Automatically removes old attempts outside the window
 * - Uses Redis TTL for automatic cleanup
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  
  /** Maximum number of failed attempts allowed in the window */
  private static readonly MAX_ATTEMPTS = 5;
  
  /** Time window for counting attempts in milliseconds (1 minute) */
  private static readonly WINDOW_MS = 60000;
  
  /** Ban duration in milliseconds (5 minutes) */
  private static readonly BAN_DURATION_MS = 300000;

  constructor(private readonly redisService: RedisService) {}

  /**
   * Check if an app session is currently banned
   * 
   * Checks the ban record in Redis and verifies if the ban is still active.
   * If the ban has expired, it is automatically removed.
   * 
   * @param appSessionId The unique identifier of the app's WebSocket session
   * @returns true if the session is banned, false otherwise
   * 
   * @example
   * const banned = await service.isBanned('app-session-123');
   * if (banned) {
   *   console.log('Session is banned');
   * }
   */
  async isBanned(appSessionId: string): Promise<boolean> {
    const redis = this.redisService.getClient();
    const banKey = `ratelimit:ban:${appSessionId}`;
    
    // Get the banned until timestamp
    const bannedUntil = await redis.get(banKey);
    
    if (!bannedUntil) {
      return false;
    }
    
    const now = Date.now();
    const banExpiry = parseInt(bannedUntil, 10);
    
    // Check if the ban has expired
    if (now >= banExpiry) {
      // Ban has expired, clean up
      await redis.del(banKey);
      this.logger.debug(`Ban expired for session: ${appSessionId}`);
      return false;
    }
    
    this.logger.debug(`Session is banned: ${appSessionId}, expires at: ${new Date(banExpiry).toISOString()}`);
    return true;
  }

  /**
   * Record a failed pairing attempt
   * 
   * Uses Redis Sorted Set to implement a sliding window rate limiter:
   * 1. Add the current attempt with timestamp as score
   * 2. Remove attempts outside the time window
   * 3. Count remaining attempts in the window
   * 4. If count >= MAX_ATTEMPTS, ban the session
   * 
   * The sliding window approach ensures accurate rate limiting without
   * the edge cases of fixed windows.
   * 
   * @param appSessionId The unique identifier of the app's WebSocket session
   * 
   * @example
   * await service.recordFailedAttempt('app-session-123');
   * // If this is the 5th attempt in 1 minute, the session will be banned
   */
  async recordFailedAttempt(appSessionId: string): Promise<void> {
    const redis = this.redisService.getClient();
    const key = `ratelimit:attempts:${appSessionId}`;
    const now = Date.now();
    
    // Add the current attempt to the sorted set
    // Score: timestamp, Member: unique attempt ID (timestamp + random suffix for uniqueness)
    // This ensures multiple attempts in the same millisecond are counted separately
    const attemptId = `${now}-${Math.random().toString(36).substring(2, 9)}`;
    await redis.zadd(key, now, attemptId);
    
    // Remove attempts outside the sliding window
    const windowStart = now - RateLimitService.WINDOW_MS;
    await redis.zremrangebyscore(key, 0, windowStart);
    
    // Set TTL on the attempts key to prevent memory leaks
    // TTL is slightly longer than the window to ensure cleanup
    await redis.expire(key, Math.ceil(RateLimitService.WINDOW_MS / 1000));
    
    // Count the number of attempts in the current window
    const count = await redis.zcard(key);
    
    this.logger.debug(`Failed attempt recorded for session ${appSessionId}: ${count}/${RateLimitService.MAX_ATTEMPTS}`);
    
    // Check if the threshold has been exceeded
    if (count >= RateLimitService.MAX_ATTEMPTS) {
      // Trigger ban
      const banKey = `ratelimit:ban:${appSessionId}`;
      const bannedUntil = now + RateLimitService.BAN_DURATION_MS;
      
      await redis.set(banKey, bannedUntil.toString());
      await redis.expire(banKey, Math.ceil(RateLimitService.BAN_DURATION_MS / 1000));
      
      this.logger.warn(
        `Session banned due to excessive failed attempts: ${appSessionId}, ` +
        `banned until: ${new Date(bannedUntil).toISOString()}`
      );
    }
  }

  /**
   * Reset the rate limit counter for a session
   * 
   * Called when a pairing attempt succeeds. This clears the failed attempt
   * counter, allowing the session to start fresh.
   * 
   * Note: This does NOT remove an active ban. If a session is banned,
   * it must wait for the ban to expire.
   * 
   * @param appSessionId The unique identifier of the app's WebSocket session
   * 
   * @example
   * // After successful pairing
   * await service.reset('app-session-123');
   * console.log('Rate limit counter reset');
   */
  async reset(appSessionId: string): Promise<void> {
    const redis = this.redisService.getClient();
    const key = `ratelimit:attempts:${appSessionId}`;
    
    // Delete the attempts counter
    await redis.del(key);
    
    this.logger.debug(`Rate limit counter reset for session: ${appSessionId}`);
  }

  /**
   * Get the remaining ban time for a session in seconds
   * 
   * Returns the number of seconds until the ban expires.
   * Returns 0 if the session is not banned or the ban has expired.
   * 
   * @param appSessionId The unique identifier of the app's WebSocket session
   * @returns Remaining ban time in seconds (0 if not banned)
   * 
   * @example
   * const remaining = await service.getRemainingBanTime('app-session-123');
   * if (remaining > 0) {
   *   console.log(`Please wait ${remaining} seconds before trying again`);
   * }
   */
  async getRemainingBanTime(appSessionId: string): Promise<number> {
    const redis = this.redisService.getClient();
    const banKey = `ratelimit:ban:${appSessionId}`;
    
    // Get the banned until timestamp
    const bannedUntil = await redis.get(banKey);
    
    if (!bannedUntil) {
      return 0;
    }
    
    const now = Date.now();
    const banExpiry = parseInt(bannedUntil, 10);
    
    // Calculate remaining time in milliseconds
    const remaining = Math.max(0, banExpiry - now);
    
    // Convert to seconds and round up
    return Math.ceil(remaining / 1000);
  }
}

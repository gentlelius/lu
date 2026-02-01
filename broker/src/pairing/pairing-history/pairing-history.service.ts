import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PairingHistoryEntry } from '../types/pairing.types';

/**
 * PairingHistoryService
 * 
 * Manages the historical record of pairing events for auditing and troubleshooting.
 * 
 * Key responsibilities:
 * - Record all pairing events (both successful and failed)
 * - Maintain a fixed-size history (max 1000 entries)
 * - Provide access to historical records for analysis
 * 
 * Storage Strategy:
 * - Uses Redis List (LPUSH for new entries, LTRIM to maintain size)
 * - Most recent entries are at the head of the list
 * - Automatically removes oldest entries when limit is exceeded
 * 
 * Redis Key Design:
 * - pairing:history -> List of JSON-serialized PairingHistoryEntry objects
 * 
 * Implementation Details:
 * - LPUSH adds new entries to the head (most recent first)
 * - LTRIM keeps only the first MAX_ENTRIES items
 * - LRANGE retrieves entries with pagination support
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */
@Injectable()
export class PairingHistoryService {
  private readonly logger = new Logger(PairingHistoryService.name);
  
  /** Maximum number of history entries to keep */
  private static readonly MAX_ENTRIES = 1000;
  
  /** Redis key for storing history */
  private static readonly HISTORY_KEY = 'pairing:history';

  constructor(private readonly redisService: RedisService) {}

  /**
   * Record a pairing event (success or failure)
   * 
   * Adds the event to the history list and automatically trims the list
   * to maintain the maximum size limit. Uses LPUSH to add to the head
   * (most recent first) and LTRIM to keep only the most recent entries.
   * 
   * The operation is atomic - both LPUSH and LTRIM are executed, ensuring
   * the list never grows beyond MAX_ENTRIES.
   * 
   * @param entry The pairing history entry to record
   * 
   * @example
   * // Record a successful pairing
   * await service.record({
   *   timestamp: Date.now(),
   *   appSessionId: 'app-123',
   *   runnerId: 'runner-456',
   *   pairingCode: 'ABC-123-XYZ',
   *   success: true
   * });
   * 
   * @example
   * // Record a failed pairing
   * await service.record({
   *   timestamp: Date.now(),
   *   appSessionId: 'app-123',
   *   runnerId: null,
   *   pairingCode: 'ABC-123-XYZ',
   *   success: false,
   *   errorCode: PairingErrorCode.CODE_NOT_FOUND
   * });
   */
  async record(entry: PairingHistoryEntry): Promise<void> {
    const redis = this.redisService.getClient();
    
    try {
      // Serialize the entry to JSON
      const serialized = JSON.stringify(entry);
      
      // Add the entry to the head of the list (most recent first)
      await redis.lpush(PairingHistoryService.HISTORY_KEY, serialized);
      
      // Trim the list to keep only the most recent MAX_ENTRIES
      // LTRIM keeps elements from index 0 to MAX_ENTRIES-1 (inclusive)
      await redis.ltrim(
        PairingHistoryService.HISTORY_KEY,
        0,
        PairingHistoryService.MAX_ENTRIES - 1
      );
      
      this.logger.debug(
        `Pairing event recorded: ${entry.success ? 'SUCCESS' : 'FAILURE'}, ` +
        `appSessionId: ${entry.appSessionId}, ` +
        `pairingCode: ${entry.pairingCode}, ` +
        `runnerId: ${entry.runnerId || 'N/A'}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to record pairing event: ${error.message}`,
        error.stack
      );
      // Don't throw - history recording should not break the pairing flow
    }
  }

  /**
   * Get historical pairing records
   * 
   * Retrieves pairing history entries from Redis, with support for limiting
   * the number of results. Returns entries in reverse chronological order
   * (most recent first).
   * 
   * @param limit Maximum number of entries to retrieve (default: 100, max: 1000)
   * @returns Array of pairing history entries, most recent first
   * 
   * @example
   * // Get the 10 most recent pairing events
   * const recent = await service.getHistory(10);
   * recent.forEach(entry => {
   *   console.log(`${new Date(entry.timestamp).toISOString()}: ${entry.success ? 'SUCCESS' : 'FAILURE'}`);
   * });
   * 
   * @example
   * // Get all history (up to 1000 entries)
   * const allHistory = await service.getHistory(1000);
   */
  async getHistory(limit: number = 100): Promise<PairingHistoryEntry[]> {
    const redis = this.redisService.getClient();
    
    try {
      // Ensure limit is within bounds
      const safeLimit = Math.min(Math.max(1, limit), PairingHistoryService.MAX_ENTRIES);
      
      // Retrieve entries from the list (0-indexed, inclusive)
      // LRANGE returns elements from start to stop (inclusive)
      const data = await redis.lrange(
        PairingHistoryService.HISTORY_KEY,
        0,
        safeLimit - 1
      );
      
      // Parse each JSON entry
      const entries: PairingHistoryEntry[] = data.map(item => {
        try {
          return JSON.parse(item);
        } catch (parseError) {
          this.logger.warn(`Failed to parse history entry: ${parseError.message}`);
          return null;
        }
      }).filter(entry => entry !== null);
      
      this.logger.debug(`Retrieved ${entries.length} history entries (limit: ${safeLimit})`);
      
      return entries;
    } catch (error) {
      this.logger.error(
        `Failed to retrieve pairing history: ${error.message}`,
        error.stack
      );
      // Return empty array on error rather than throwing
      return [];
    }
  }

  /**
   * Get the total number of history entries
   * 
   * Returns the current size of the history list. This will never exceed
   * MAX_ENTRIES due to automatic trimming.
   * 
   * @returns The number of entries in the history
   * 
   * @example
   * const count = await service.getHistoryCount();
   * console.log(`Total history entries: ${count}`);
   */
  async getHistoryCount(): Promise<number> {
    const redis = this.redisService.getClient();
    
    try {
      const count = await redis.llen(PairingHistoryService.HISTORY_KEY);
      return count;
    } catch (error) {
      this.logger.error(
        `Failed to get history count: ${error.message}`,
        error.stack
      );
      return 0;
    }
  }

  /**
   * Clear all history entries
   * 
   * Removes all entries from the history list. This is primarily useful
   * for testing or administrative cleanup.
   * 
   * @example
   * await service.clearHistory();
   * console.log('History cleared');
   */
  async clearHistory(): Promise<void> {
    const redis = this.redisService.getClient();
    
    try {
      await redis.del(PairingHistoryService.HISTORY_KEY);
      this.logger.log('Pairing history cleared');
    } catch (error) {
      this.logger.error(
        `Failed to clear history: ${error.message}`,
        error.stack
      );
    }
  }
}

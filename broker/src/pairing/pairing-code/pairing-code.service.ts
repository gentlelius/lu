import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PairingCodeEntry, PairingErrorCode } from '../types/pairing.types';

/**
 * PairingCodeService
 * 
 * Manages pairing code registration, validation, and lifecycle in Redis.
 * 
 * Key responsibilities:
 * - Register new pairing codes with atomic uniqueness checks (SETNX)
 * - Validate pairing codes and check expiration
 * - Invalidate pairing codes when runners disconnect
 * - Maintain bidirectional mappings (code -> runner, runner -> code)
 * - Implement retry mechanism for collision handling
 * 
 * Redis Key Design:
 * - pairing:code:{code} -> PairingCodeEntry (JSON)
 * - pairing:runner:{runnerId} -> code (string)
 * 
 * Requirements: 1.5, 3.2, 3.3, 4.2, 5.1, 5.4, 11.1, 11.2, 11.4
 */
@Injectable()
export class PairingCodeService {
  private readonly logger = new Logger(PairingCodeService.name);
  
  /** TTL for pairing codes in seconds (24 hours) */
  private static readonly CODE_TTL = 24 * 60 * 60;
  
  /** Maximum number of retries for code registration on collision */
  private static readonly MAX_RETRIES = 3;

  constructor(private readonly redisService: RedisService) {}

  /**
   * Register a new pairing code with atomic uniqueness check
   * 
   * Uses Redis SETNX (SET if Not eXists) to guarantee atomicity.
   * If the code already exists, the registration fails and should be retried
   * with a different code.
   * 
   * This method implements the second layer of uniqueness protection:
   * 1. Statistical uniqueness (36^9 possibilities)
   * 2. Redis SETNX atomic check (this method)
   * 3. Retry mechanism (handled by caller)
   * 
   * @param code The pairing code to register (format: XXX-XXX-XXX)
   * @param runnerId The unique identifier of the runner
   * @throws Error with code 'DUPLICATE_CODE' if the code already exists
   * 
   * @example
   * try {
   *   await service.registerCode('ABC-123-XYZ', 'runner-uuid-123');
   *   console.log('Code registered successfully');
   * } catch (error) {
   *   if (error.message === 'DUPLICATE_CODE') {
   *     // Generate a new code and retry
   *   }
   * }
   */
  async registerCode(code: string, runnerId: string): Promise<void> {
    const redis = this.redisService.getClient();
    const key = `pairing:code:${code}`;
    
    const now = Date.now();
    const entry: PairingCodeEntry = {
      code,
      runnerId,
      createdAt: now,
      expiresAt: now + PairingCodeService.CODE_TTL * 1000,
      usedCount: 0,
      isActive: true,
    };
    
    // Use SETNX to atomically set the key only if it doesn't exist
    // Returns 1 if the key was set, 0 if it already exists
    const success = await redis.setnx(key, JSON.stringify(entry));
    
    if (!success) {
      this.logger.warn(`Pairing code collision detected: ${code}`);
      throw new Error(PairingErrorCode.DUPLICATE_CODE);
    }
    
    // Set TTL for automatic expiration after 24 hours
    await redis.expire(key, PairingCodeService.CODE_TTL);
    
    // Create reverse index: runnerId -> code
    await redis.set(`pairing:runner:${runnerId}`, code);
    
    this.logger.log(`Pairing code registered: ${code} for runner: ${runnerId}`);
  }

  /**
   * Validate a pairing code and return the associated runner ID
   * 
   * Checks:
   * 1. Code exists in Redis
   * 2. Code is still active
   * 3. Code has not expired (unless it has been used at least once)
   * 
   * If the code has expired and has never been used, it is automatically invalidated.
   * Used codes (usedCount > 0) remain valid indefinitely until the runner disconnects.
   * 
   * @param code The pairing code to validate
   * @returns Validation result with runner ID if valid, or error code if invalid
   * 
   * @example
   * const result = await service.validateCode('ABC-123-XYZ');
   * if (result.valid) {
   *   console.log('Runner ID:', result.runnerId);
   * } else {
   *   console.log('Error:', result.error);
   * }
   */
  async validateCode(code: string): Promise<{
    valid: boolean;
    runnerId?: string;
    error?: string;
  }> {
    const redis = this.redisService.getClient();
    const key = `pairing:code:${code}`;
    
    // Retrieve the code entry from Redis
    const data = await redis.get(key);
    
    if (!data) {
      this.logger.debug(`Pairing code not found: ${code}`);
      return { valid: false, error: PairingErrorCode.CODE_NOT_FOUND };
    }
    
    const entry: PairingCodeEntry = JSON.parse(data);
    
    // Check if the code is active
    if (!entry.isActive) {
      this.logger.debug(`Pairing code is inactive: ${code}`);
      return { valid: false, error: PairingErrorCode.CODE_EXPIRED };
    }
    
    // Check if the code has expired
    // Used codes (usedCount > 0) remain valid indefinitely (Requirement 5.3)
    const now = Date.now();
    if (entry.usedCount === 0 && now > entry.expiresAt) {
      this.logger.debug(`Pairing code has expired: ${code}`);
      // Automatically invalidate the expired code
      await this.invalidateCode(code);
      return { valid: false, error: PairingErrorCode.CODE_EXPIRED };
    }
    
    this.logger.debug(`Pairing code validated: ${code} for runner: ${entry.runnerId}`);
    return { valid: true, runnerId: entry.runnerId };
  }

  /**
   * Invalidate a pairing code
   * 
   * Removes the code from Redis, making it unavailable for future pairing attempts.
   * This is called when:
   * - A runner disconnects
   * - A code expires
   * - Manual invalidation is needed
   * 
   * Also removes the reverse index (runner -> code).
   * 
   * @param code The pairing code to invalidate
   * 
   * @example
   * await service.invalidateCode('ABC-123-XYZ');
   * console.log('Code invalidated');
   */
  async invalidateCode(code: string): Promise<void> {
    const redis = this.redisService.getClient();
    const key = `pairing:code:${code}`;
    
    // Get the entry to find the runner ID
    const data = await redis.get(key);
    if (data) {
      const entry: PairingCodeEntry = JSON.parse(data);
      
      // Remove the reverse index
      await redis.del(`pairing:runner:${entry.runnerId}`);
      
      this.logger.log(`Pairing code invalidated: ${code} for runner: ${entry.runnerId}`);
    }
    
    // Remove the code entry
    await redis.del(key);
  }

  /**
   * Find the pairing code associated with a runner ID
   * 
   * Uses the reverse index (runner -> code) for efficient lookup.
   * 
   * @param runnerId The unique identifier of the runner
   * @returns The pairing code if found, null otherwise
   * 
   * @example
   * const code = await service.findCodeByRunnerId('runner-uuid-123');
   * if (code) {
   *   console.log('Pairing code:', code);
   * } else {
   *   console.log('No code found for this runner');
   * }
   */
  async findCodeByRunnerId(runnerId: string): Promise<string | null> {
    const redis = this.redisService.getClient();
    const code = await redis.get(`pairing:runner:${runnerId}`);
    
    if (code) {
      this.logger.debug(`Found pairing code for runner ${runnerId}: ${code}`);
    } else {
      this.logger.debug(`No pairing code found for runner: ${runnerId}`);
    }
    
    return code;
  }

  /**
   * Register a pairing code with automatic retry on collision
   * 
   * Implements the third layer of uniqueness protection by retrying
   * up to MAX_RETRIES times if a collision is detected.
   * 
   * @param codeGenerator Function that generates a new pairing code
   * @param runnerId The unique identifier of the runner
   * @returns The successfully registered pairing code
   * @throws Error if registration fails after all retries
   * 
   * @example
   * const generator = new PairingCodeGenerator();
   * const code = await service.registerCodeWithRetry(
   *   () => generator.generate(),
   *   'runner-uuid-123'
   * );
   * console.log('Registered code:', code);
   */
  async registerCodeWithRetry(
    codeGenerator: () => string,
    runnerId: string,
  ): Promise<string> {
    for (let attempt = 0; attempt < PairingCodeService.MAX_RETRIES; attempt++) {
      const code = codeGenerator();
      
      try {
        await this.registerCode(code, runnerId);
        return code;
      } catch (error) {
        if (error.message === PairingErrorCode.DUPLICATE_CODE) {
          this.logger.warn(
            `Pairing code collision on attempt ${attempt + 1}/${PairingCodeService.MAX_RETRIES}: ${code}`,
          );
          
          // If this was the last attempt, throw the error
          if (attempt === PairingCodeService.MAX_RETRIES - 1) {
            throw new Error(
              `Failed to generate unique pairing code after ${PairingCodeService.MAX_RETRIES} attempts`,
            );
          }
          
          // Otherwise, continue to the next iteration to retry
          continue;
        }
        
        // If it's a different error, rethrow it
        throw error;
      }
    }
    
    // This should never be reached due to the throw in the loop
    throw new Error('Unexpected error in registerCodeWithRetry');
  }

  /**
   * Increment the usage count for a pairing code
   * 
   * Called when a pairing code is successfully used for pairing.
   * This helps track code usage and can be used for analytics.
   * 
   * When a code is used for the first time (usedCount becomes 1),
   * the TTL is removed to make the code valid indefinitely until
   * the runner disconnects (Requirement 5.3).
   * 
   * @param code The pairing code that was used
   * 
   * @example
   * await service.incrementUsageCount('ABC-123-XYZ');
   */
  async incrementUsageCount(code: string): Promise<void> {
    const redis = this.redisService.getClient();
    const key = `pairing:code:${code}`;
    
    const data = await redis.get(key);
    if (data) {
      const entry: PairingCodeEntry = JSON.parse(data);
      const wasUnused = entry.usedCount === 0;
      entry.usedCount++;
      
      // Update the entry in Redis
      await redis.set(key, JSON.stringify(entry));
      
      // If this is the first use, remove TTL to make it valid indefinitely
      if (wasUnused) {
        await redis.persist(key);
        this.logger.log(`Pairing code ${code} marked as used, TTL removed (continuous validity)`);
      }
      
      this.logger.debug(`Incremented usage count for code ${code}: ${entry.usedCount}`);
    }
  }
}

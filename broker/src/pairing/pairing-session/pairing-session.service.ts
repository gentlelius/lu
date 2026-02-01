import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PairingSession } from '../types/pairing.types';

/**
 * PairingSessionService
 * 
 * Manages pairing sessions between apps and runners in Redis.
 * 
 * Key responsibilities:
 * - Create pairing sessions (app -> runner mapping)
 * - Retrieve pairing session information
 * - Remove pairing sessions
 * - Track which apps are paired with each runner (using Redis Sets)
 * - Check runner online status via heartbeat
 * 
 * Redis Key Design:
 * - pairing:session:{appSessionId} -> PairingSession (JSON)
 * - pairing:apps:{runnerId} -> Set of app session IDs
 * - runner:heartbeat:{runnerId} -> timestamp (milliseconds)
 * 
 * Requirements: 4.1, 4.4, 4.5, 7.1, 7.4, 8.1
 */
@Injectable()
export class PairingSessionService {
  private readonly logger = new Logger(PairingSessionService.name);
  
  /** Heartbeat timeout in milliseconds (30 seconds) */
  private static readonly HEARTBEAT_TIMEOUT_MS = 30000;

  constructor(private readonly redisService: RedisService) {}

  /**
   * Create a new pairing session
   * 
   * Establishes a pairing relationship between an app and a runner.
   * Creates two mappings:
   * 1. app session ID -> runner ID (for quick lookup)
   * 2. runner ID -> set of app session IDs (for broadcasting)
   * 
   * Requirement 4.1: Store pairing relationship (app session_id to runner_id mapping)
   * Requirement 4.5: Allow one runner to pair with multiple apps
   * 
   * @param appSessionId The unique identifier of the app's WebSocket session
   * @param runnerId The unique identifier of the runner
   * 
   * @example
   * await service.createSession('app-uuid-123', 'runner-uuid-456');
   * console.log('Pairing session created');
   */
  async createSession(appSessionId: string, runnerId: string): Promise<void> {
    const redis = this.redisService.getClient();
    
    const session: PairingSession = {
      appSessionId,
      runnerId,
      pairedAt: Date.now(),
      isActive: true,
    };
    
    // Store app -> runner mapping
    const sessionKey = `pairing:session:${appSessionId}`;
    await redis.set(sessionKey, JSON.stringify(session));
    
    // Add app to runner's app set (for tracking multiple apps per runner)
    const appsKey = `pairing:apps:${runnerId}`;
    await redis.sadd(appsKey, appSessionId);
    
    this.logger.log(
      `Pairing session created: app ${appSessionId} paired with runner ${runnerId}`,
    );
  }

  /**
   * Get the pairing session for an app
   * 
   * Retrieves the pairing information for a specific app session.
   * Returns null if the app is not paired with any runner.
   * 
   * Requirement 7.1: Check if app has pairing relationship
   * 
   * @param appSessionId The unique identifier of the app's WebSocket session
   * @returns The pairing session if found, null otherwise
   * 
   * @example
   * const session = await service.getSession('app-uuid-123');
   * if (session) {
   *   console.log('Paired with runner:', session.runnerId);
   * } else {
   *   console.log('Not paired');
   * }
   */
  async getSession(appSessionId: string): Promise<PairingSession | null> {
    const redis = this.redisService.getClient();
    const sessionKey = `pairing:session:${appSessionId}`;
    
    const data = await redis.get(sessionKey);
    
    if (!data) {
      this.logger.debug(`No pairing session found for app: ${appSessionId}`);
      return null;
    }
    
    const session: PairingSession = JSON.parse(data);
    this.logger.debug(
      `Found pairing session for app ${appSessionId}: runner ${session.runnerId}`,
    );
    
    return session;
  }

  /**
   * Remove a pairing session
   * 
   * Deletes the pairing relationship between an app and a runner.
   * Removes both:
   * 1. The app -> runner mapping
   * 2. The app from the runner's app set
   * 
   * Requirement 8.1: Delete app-runner pairing relationship
   * 
   * @param appSessionId The unique identifier of the app's WebSocket session
   * 
   * @example
   * await service.removeSession('app-uuid-123');
   * console.log('Pairing session removed');
   */
  async removeSession(appSessionId: string): Promise<void> {
    const redis = this.redisService.getClient();
    
    // Get the session to find the runner ID
    const session = await this.getSession(appSessionId);
    
    if (session) {
      // Remove app from runner's app set
      const appsKey = `pairing:apps:${session.runnerId}`;
      await redis.srem(appsKey, appSessionId);
      
      this.logger.log(
        `Removed app ${appSessionId} from runner ${session.runnerId}'s app list`,
      );
    }
    
    // Remove the session mapping
    const sessionKey = `pairing:session:${appSessionId}`;
    await redis.del(sessionKey);
    
    this.logger.log(`Pairing session removed for app: ${appSessionId}`);
  }

  /**
   * Get all apps paired with a specific runner
   * 
   * Returns the list of app session IDs that are currently paired
   * with the specified runner. This is useful for:
   * - Broadcasting messages to all paired apps
   * - Notifying apps when a runner reconnects
   * - Tracking active connections
   * 
   * Requirement 4.5: Track multiple apps paired with one runner
   * 
   * @param runnerId The unique identifier of the runner
   * @returns Array of app session IDs paired with this runner
   * 
   * @example
   * const apps = await service.getAppsByRunnerId('runner-uuid-456');
   * console.log('Paired apps:', apps);
   * // Output: ['app-uuid-123', 'app-uuid-789']
   */
  async getAppsByRunnerId(runnerId: string): Promise<string[]> {
    const redis = this.redisService.getClient();
    const appsKey = `pairing:apps:${runnerId}`;
    
    const apps = await redis.smembers(appsKey);
    
    this.logger.debug(
      `Found ${apps.length} apps paired with runner ${runnerId}`,
    );
    
    return apps;
  }

  /**
   * Check if a runner is currently online
   * 
   * Determines runner online status by checking the heartbeat timestamp.
   * A runner is considered online if its last heartbeat was within
   * the last 30 seconds.
   * 
   * The heartbeat mechanism:
   * - Runners send heartbeat every 10 seconds
   * - Heartbeat updates the timestamp in Redis
   * - If no heartbeat for 30 seconds, runner is considered offline
   * 
   * Requirement 7.4: Verify paired runner is still online
   * 
   * @param runnerId The unique identifier of the runner
   * @returns true if the runner is online, false otherwise
   * 
   * @example
   * const isOnline = await service.isRunnerOnline('runner-uuid-456');
   * if (isOnline) {
   *   console.log('Runner is online');
   * } else {
   *   console.log('Runner is offline');
   * }
   */
  async isRunnerOnline(runnerId: string): Promise<boolean> {
    const redis = this.redisService.getClient();
    const heartbeatKey = `runner:heartbeat:${runnerId}`;
    
    const heartbeat = await redis.get(heartbeatKey);
    
    if (!heartbeat) {
      this.logger.debug(`No heartbeat found for runner: ${runnerId}`);
      return false;
    }
    
    const lastHeartbeat = parseInt(heartbeat, 10);
    const now = Date.now();
    const timeSinceHeartbeat = now - lastHeartbeat;
    
    const isOnline = timeSinceHeartbeat < PairingSessionService.HEARTBEAT_TIMEOUT_MS;
    
    this.logger.debug(
      `Runner ${runnerId} heartbeat check: ${timeSinceHeartbeat}ms ago, online: ${isOnline}`,
    );
    
    return isOnline;
  }

  /**
   * Update the heartbeat timestamp for a runner
   * 
   * This method should be called periodically by the runner (every 10 seconds)
   * to indicate that it is still online and active.
   * 
   * The heartbeat key has a TTL of 60 seconds, so if the runner stops
   * sending heartbeats, the key will automatically expire.
   * 
   * @param runnerId The unique identifier of the runner
   * 
   * @example
   * await service.updateHeartbeat('runner-uuid-456');
   * console.log('Heartbeat updated');
   */
  async updateHeartbeat(runnerId: string): Promise<void> {
    const redis = this.redisService.getClient();
    const heartbeatKey = `runner:heartbeat:${runnerId}`;
    
    const now = Date.now();
    await redis.set(heartbeatKey, now.toString());
    
    // Set TTL to 60 seconds (2x the heartbeat timeout)
    await redis.expire(heartbeatKey, 60);
    
    this.logger.debug(`Heartbeat updated for runner: ${runnerId}`);
  }

  /**
   * Remove all pairing sessions for a specific runner
   * 
   * This is called when a runner disconnects. It:
   * 1. Gets all apps paired with the runner
   * 2. Removes each app's pairing session
   * 3. Clears the runner's app set
   * 
   * Requirement 4.4: Preserve pairing relationship when app disconnects
   * (but remove when runner disconnects)
   * 
   * @param runnerId The unique identifier of the runner
   * @returns Array of app session IDs that were unpaired
   * 
   * @example
   * const unpairedApps = await service.removeAllSessionsForRunner('runner-uuid-456');
   * console.log('Unpaired apps:', unpairedApps);
   */
  async removeAllSessionsForRunner(runnerId: string): Promise<string[]> {
    const redis = this.redisService.getClient();
    
    // Get all apps paired with this runner
    const apps = await this.getAppsByRunnerId(runnerId);
    
    // Remove each app's session
    for (const appSessionId of apps) {
      const sessionKey = `pairing:session:${appSessionId}`;
      await redis.del(sessionKey);
      
      this.logger.debug(
        `Removed pairing session for app ${appSessionId} (runner ${runnerId} disconnected)`,
      );
    }
    
    // Clear the runner's app set
    const appsKey = `pairing:apps:${runnerId}`;
    await redis.del(appsKey);
    
    this.logger.log(
      `Removed all pairing sessions for runner ${runnerId}: ${apps.length} apps unpaired`,
    );
    
    return apps;
  }
}

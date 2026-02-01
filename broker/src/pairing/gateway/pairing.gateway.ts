import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { PairingCodeService } from '../pairing-code/pairing-code.service';
import { PairingSessionService } from '../pairing-session/pairing-session.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { PairingHistoryService } from '../pairing-history/pairing-history.service';
import { PairingCodeGenerator } from '../code-generator/pairing-code-generator';
import { PairingErrorCode } from '../types/pairing.types';

/**
 * PairingGateway
 * 
 * WebSocket gateway for managing runner-app pairing functionality.
 * 
 * Key responsibilities:
 * - Handle runner registration with pairing codes
 * - Process app pairing requests
 * - Manage pairing sessions and status queries
 * - Handle disconnections and cleanup
 * - Implement heartbeat mechanism for runner online status
 * 
 * Socket.io Events:
 * - runner:register: Runner registers with a pairing code
 * - runner:heartbeat: Runner sends periodic heartbeat
 * - app:pair: App requests to pair with a runner
 * - app:pairing:status: App queries current pairing status
 * - app:unpair: App requests to unpair from runner
 * 
 * Requirements: All pairing requirements integration
 */
@WebSocketGateway({
  cors: {
    origin: '*',
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})
export class PairingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(PairingGateway.name);
  
  /** Map of runner IDs to their socket connections */
  private runnerSockets = new Map<string, Socket>();
  
  /** Map of socket IDs to runner IDs (for cleanup on disconnect) */
  private socketToRunner = new Map<string, string>();
  
  /** Map of socket IDs to app session IDs (for cleanup on disconnect) */
  private socketToApp = new Map<string, string>();
  
  /** Pairing code generator instance */
  private codeGenerator = new PairingCodeGenerator();

  constructor(
    private readonly pairingCodeService: PairingCodeService,
    private readonly pairingSessionService: PairingSessionService,
    private readonly rateLimitService: RateLimitService,
    private readonly pairingHistoryService: PairingHistoryService,
  ) {}

  /**
   * Handle new client connections
   * 
   * Called when any client (runner or app) connects to the WebSocket server.
   * Logs the connection for monitoring purposes.
   */
  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  /**
   * Handle client disconnections
   * 
   * Called when any client (runner or app) disconnects from the WebSocket server.
   * Performs cleanup based on the client type:
   * - Runner: Invalidate pairing code, notify paired apps, remove sessions
   * - App: Preserve pairing relationship (allow reconnection)
   * 
   * Requirements: 4.2, 4.4, 9.2
   */
  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    
    // Check if this is a runner
    const runnerId = this.socketToRunner.get(client.id);
    if (runnerId) {
      this.handleRunnerDisconnect(runnerId, client.id);
      return;
    }
    
    // Check if this is an app
    const appSessionId = this.socketToApp.get(client.id);
    if (appSessionId) {
      this.handleAppDisconnect(appSessionId, client.id);
      return;
    }
  }

  /**
   * Handle runner disconnection
   * 
   * When a runner disconnects:
   * 1. Invalidate the pairing code
   * 2. Get all paired apps
   * 3. Notify each app that the runner is offline
   * 4. Remove all pairing sessions for this runner
   * 5. Clean up internal mappings
   * 
   * Requirements: 4.2, 9.2
   */
  private async handleRunnerDisconnect(runnerId: string, socketId: string) {
    this.logger.log(`Runner disconnected: ${runnerId}`);
    
    try {
      // Find and invalidate the pairing code
      const code = await this.pairingCodeService.findCodeByRunnerId(runnerId);
      if (code) {
        await this.pairingCodeService.invalidateCode(code);
        this.logger.log(`Invalidated pairing code for runner ${runnerId}: ${code}`);
      }
      
      // Get all apps paired with this runner
      const pairedApps = await this.pairingSessionService.removeAllSessionsForRunner(runnerId);
      
      // Notify each paired app that the runner is offline
      for (const appSessionId of pairedApps) {
        // Find the app's socket
        for (const [sid, asid] of this.socketToApp.entries()) {
          if (asid === appSessionId) {
            const appSocket = this.server.sockets.sockets.get(sid);
            if (appSocket) {
              appSocket.emit('runner:offline', { runnerId });
              this.logger.log(`Notified app ${appSessionId} that runner ${runnerId} is offline`);
            }
            break;
          }
        }
      }
      
      // Clean up internal mappings
      this.runnerSockets.delete(runnerId);
      this.socketToRunner.delete(socketId);
      
    } catch (error) {
      this.logger.error(`Error handling runner disconnect: ${error.message}`, error.stack);
    }
  }

  /**
   * Handle app disconnection
   * 
   * When an app disconnects:
   * 1. Preserve the pairing relationship (allow reconnection)
   * 2. Clean up internal socket mappings
   * 
   * The pairing session remains in Redis, so when the app reconnects
   * with the same session ID, it can resume the pairing.
   * 
   * Requirements: 4.4
   */
  private handleAppDisconnect(appSessionId: string, socketId: string) {
    this.logger.log(`App disconnected: ${appSessionId} (preserving pairing relationship)`);
    
    // Clean up internal mappings (but keep the pairing session in Redis)
    this.socketToApp.delete(socketId);
  }

  /**
   * Handle runner registration
   * 
   * When a runner connects, it must register with a pairing code.
   * This handler:
   * 1. Validates the runner secret
   * 2. Attempts to register the pairing code (with retry on collision)
   * 3. Updates the runner's heartbeat
   * 4. Stores the runner's socket connection
   * 5. Returns success or error response
   * 
   * If the pairing code already exists (collision), the runner should
   * generate a new code and retry.
   * 
   * Requirements: 1.5, 11.1, 11.2
   * 
   * @param client The runner's socket connection
   * @param payload Registration data containing runnerId, pairingCode, and secret
   */
  @SubscribeMessage('runner:register')
  async handleRunnerRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: {
      runnerId: string;
      pairingCode: string;
      secret: string;
    },
  ) {
    const { runnerId, pairingCode, secret } = payload;
    
    this.logger.log(`Runner registration request: ${runnerId}, code: ${pairingCode}`);
    
    try {
      // Validate runner secret
      // In production, this should check against a database or environment variable
      // For now, we accept any secret (to be implemented with proper auth)
      if (!secret || secret.trim() === '') {
        this.logger.warn(`Runner registration failed: invalid secret for ${runnerId}`);
        client.emit('runner:register:error', {
          error: PairingErrorCode.INVALID_SECRET,
          message: 'Invalid runner secret',
        });
        return;
      }
      
      // Validate pairing code format
      if (!this.codeGenerator.validate(pairingCode)) {
        this.logger.warn(`Runner registration failed: invalid code format ${pairingCode}`);
        client.emit('runner:register:error', {
          error: PairingErrorCode.INVALID_FORMAT,
          message: 'Invalid pairing code format',
        });
        return;
      }
      
      // Attempt to register the pairing code
      try {
        await this.pairingCodeService.registerCode(pairingCode, runnerId);
      } catch (error) {
        if (error.message === PairingErrorCode.DUPLICATE_CODE) {
          // Code collision detected - runner should retry with a new code
          this.logger.warn(`Pairing code collision for runner ${runnerId}: ${pairingCode}`);
          client.emit('runner:register:error', {
            error: PairingErrorCode.DUPLICATE_CODE,
            message: 'Pairing code already exists, please retry with a new code',
          });
          return;
        }
        // Rethrow other errors
        throw error;
      }
      
      // Update runner heartbeat
      await this.pairingSessionService.updateHeartbeat(runnerId);
      
      // Store runner socket connection
      this.runnerSockets.set(runnerId, client);
      this.socketToRunner.set(client.id, runnerId);
      
      // Send success response
      client.emit('runner:register:success', {
        runnerId,
        pairingCode,
        message: 'Runner registered successfully',
      });
      
      this.logger.log(`Runner registered successfully: ${runnerId}, code: ${pairingCode}`);
      
    } catch (error) {
      this.logger.error(`Error registering runner ${runnerId}: ${error.message}`, error.stack);
      client.emit('runner:register:error', {
        error: PairingErrorCode.NETWORK_ERROR,
        message: 'Internal server error during registration',
      });
    }
  }

  /**
   * Handle runner heartbeat
   * 
   * Runners send periodic heartbeats (every 10 seconds) to indicate they are online.
   * This handler updates the heartbeat timestamp in Redis.
   * 
   * The heartbeat is used by the pairing session service to determine if a
   * runner is online (last heartbeat within 30 seconds).
   * 
   * @param client The runner's socket connection
   * @param payload Heartbeat data containing runnerId
   */
  @SubscribeMessage('runner:heartbeat')
  async handleRunnerHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { runnerId: string },
  ) {
    const { runnerId } = payload;
    
    try {
      await this.pairingSessionService.updateHeartbeat(runnerId);
      this.logger.debug(`Heartbeat received from runner: ${runnerId}`);
    } catch (error) {
      this.logger.error(`Error updating heartbeat for runner ${runnerId}: ${error.message}`);
    }
  }

  /**
   * Handle app pairing request
   * 
   * When an app wants to pair with a runner, it sends a pairing code.
   * This handler:
   * 1. Checks rate limiting (ban status)
   * 2. Validates pairing code format
   * 3. Validates the pairing code exists and is active
   * 4. Checks if the runner is online
   * 5. Creates a pairing session
   * 6. Records the pairing event in history
   * 7. Resets rate limit counter on success
   * 8. Returns success or error response
   * 
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.1, 6.2, 12.1, 12.2
   * 
   * @param client The app's socket connection
   * @param payload Pairing request data containing pairingCode
   */
  @SubscribeMessage('app:pair')
  async handleAppPair(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { pairingCode: string },
  ) {
    const { pairingCode } = payload;
    const appSessionId = client.id; // Use socket ID as session ID
    
    this.logger.log(`App pairing request: ${appSessionId}, code: ${pairingCode}`);
    
    try {
      // 1. Check rate limiting
      const isBanned = await this.rateLimitService.isBanned(appSessionId);
      if (isBanned) {
        const remainingBanTime = await this.rateLimitService.getRemainingBanTime(appSessionId);
        
        this.logger.warn(`App ${appSessionId} is rate limited, ${remainingBanTime}s remaining`);
        
        // Record failed attempt in history
        await this.pairingHistoryService.record({
          timestamp: Date.now(),
          appSessionId,
          runnerId: null,
          pairingCode,
          success: false,
          errorCode: PairingErrorCode.RATE_LIMITED,
        });
        
        client.emit('app:pair:error', {
          error: PairingErrorCode.RATE_LIMITED,
          message: `Too many failed attempts. Please try again in ${remainingBanTime} seconds.`,
          remainingBanTime,
        });
        return;
      }
      
      // 2. Validate pairing code format
      if (!this.codeGenerator.validate(pairingCode)) {
        this.logger.warn(`Invalid pairing code format: ${pairingCode}`);
        
        // Record failed attempt
        await this.rateLimitService.recordFailedAttempt(appSessionId);
        await this.pairingHistoryService.record({
          timestamp: Date.now(),
          appSessionId,
          runnerId: null,
          pairingCode,
          success: false,
          errorCode: PairingErrorCode.INVALID_FORMAT,
        });
        
        client.emit('app:pair:error', {
          error: PairingErrorCode.INVALID_FORMAT,
          message: 'Invalid pairing code format. Expected format: XXX-XXX-XXX',
        });
        return;
      }
      
      // 3. Validate the pairing code
      const validation = await this.pairingCodeService.validateCode(pairingCode);
      if (!validation.valid) {
        this.logger.warn(`Pairing code validation failed: ${pairingCode}, error: ${validation.error}`);
        
        // Record failed attempt
        await this.rateLimitService.recordFailedAttempt(appSessionId);
        await this.pairingHistoryService.record({
          timestamp: Date.now(),
          appSessionId,
          runnerId: null,
          pairingCode,
          success: false,
          errorCode: validation.error as PairingErrorCode,
        });
        
        let message = 'Pairing failed';
        if (validation.error === PairingErrorCode.CODE_NOT_FOUND) {
          message = 'Pairing code not found';
        } else if (validation.error === PairingErrorCode.CODE_EXPIRED) {
          message = 'Pairing code has expired';
        }
        
        client.emit('app:pair:error', {
          error: validation.error,
          message,
        });
        return;
      }
      
      const runnerId = validation.runnerId!;
      
      // 4. Check if runner is online
      const isOnline = await this.pairingSessionService.isRunnerOnline(runnerId);
      if (!isOnline) {
        this.logger.warn(`Runner is offline: ${runnerId}`);
        
        // Record failed attempt
        await this.rateLimitService.recordFailedAttempt(appSessionId);
        await this.pairingHistoryService.record({
          timestamp: Date.now(),
          appSessionId,
          runnerId,
          pairingCode,
          success: false,
          errorCode: PairingErrorCode.RUNNER_OFFLINE,
        });
        
        client.emit('app:pair:error', {
          error: PairingErrorCode.RUNNER_OFFLINE,
          message: 'Runner is currently offline',
        });
        return;
      }
      
      // 5. Create pairing session
      await this.pairingSessionService.createSession(appSessionId, runnerId);
      
      // Increment usage count for the pairing code
      await this.pairingCodeService.incrementUsageCount(pairingCode);
      
      // Store app socket mapping
      this.socketToApp.set(client.id, appSessionId);
      
      // 6. Record successful pairing in history
      await this.pairingHistoryService.record({
        timestamp: Date.now(),
        appSessionId,
        runnerId,
        pairingCode,
        success: true,
      });
      
      // 7. Reset rate limit counter on success
      await this.rateLimitService.reset(appSessionId);
      
      // 8. Send success response
      client.emit('app:pair:success', {
        runnerId,
        pairedAt: new Date().toISOString(),
        message: 'Pairing successful',
      });
      
      this.logger.log(`App paired successfully: ${appSessionId} with runner ${runnerId}`);
      
    } catch (error) {
      this.logger.error(`Error pairing app ${appSessionId}: ${error.message}`, error.stack);
      
      // Record error in history
      await this.pairingHistoryService.record({
        timestamp: Date.now(),
        appSessionId,
        runnerId: null,
        pairingCode,
        success: false,
        errorCode: PairingErrorCode.NETWORK_ERROR,
      });
      
      client.emit('app:pair:error', {
        error: PairingErrorCode.NETWORK_ERROR,
        message: 'Internal server error during pairing',
      });
    }
  }

  /**
   * Handle app pairing status query
   * 
   * When an app wants to check its current pairing status, this handler:
   * 1. Queries the pairing session for the app
   * 2. If paired, checks if the runner is still online
   * 3. Returns the pairing status with runner information
   * 
   * Requirements: 7.1, 7.2, 7.3, 7.4
   * 
   * @param client The app's socket connection
   */
  @SubscribeMessage('app:pairing:status')
  async handlePairingStatus(@ConnectedSocket() client: Socket) {
    const appSessionId = client.id;
    
    this.logger.log(`App pairing status query: ${appSessionId}`);
    
    try {
      // Query the pairing session
      const session = await this.pairingSessionService.getSession(appSessionId);
      
      if (!session) {
        // App is not paired
        client.emit('app:pairing:status:response', {
          paired: false,
          message: 'Not paired with any runner',
        });
        return;
      }
      
      // Check if the runner is still online
      const runnerOnline = await this.pairingSessionService.isRunnerOnline(session.runnerId);
      
      // Return pairing status
      client.emit('app:pairing:status:response', {
        paired: true,
        runnerId: session.runnerId,
        runnerOnline,
        pairedAt: new Date(session.pairedAt).toISOString(),
        message: runnerOnline ? 'Paired and runner is online' : 'Paired but runner is offline',
      });
      
      this.logger.log(
        `App ${appSessionId} pairing status: paired with ${session.runnerId}, online: ${runnerOnline}`
      );
      
    } catch (error) {
      this.logger.error(`Error querying pairing status for app ${appSessionId}: ${error.message}`, error.stack);
      
      client.emit('app:pairing:status:response', {
        paired: false,
        error: PairingErrorCode.NETWORK_ERROR,
        message: 'Error querying pairing status',
      });
    }
  }

  /**
   * Handle app unpair request
   * 
   * When an app wants to unpair from a runner, this handler:
   * 1. Removes the pairing session
   * 2. Keeps the runner's pairing code active (allows other apps to pair)
   * 3. Returns success response
   * 
   * Requirements: 8.1, 8.2, 8.3, 8.4
   * 
   * @param client The app's socket connection
   */
  @SubscribeMessage('app:unpair')
  async handleUnpair(@ConnectedSocket() client: Socket) {
    const appSessionId = client.id;
    
    this.logger.log(`App unpair request: ${appSessionId}`);
    
    try {
      // Get the current pairing session (for logging)
      const session = await this.pairingSessionService.getSession(appSessionId);
      
      if (!session) {
        // App is not paired
        client.emit('app:unpair:success', {
          message: 'Not paired with any runner',
        });
        return;
      }
      
      const runnerId = session.runnerId;
      
      // Remove the pairing session
      await this.pairingSessionService.removeSession(appSessionId);
      
      // Note: We do NOT invalidate the runner's pairing code
      // This allows other apps to continue pairing with the same runner
      
      // Send success response
      client.emit('app:unpair:success', {
        message: 'Unpaired successfully',
        runnerId,
      });
      
      this.logger.log(`App unpaired successfully: ${appSessionId} from runner ${runnerId}`);
      
    } catch (error) {
      this.logger.error(`Error unpairing app ${appSessionId}: ${error.message}`, error.stack);
      
      client.emit('app:unpair:error', {
        error: PairingErrorCode.NETWORK_ERROR,
        message: 'Error during unpair',
      });
    }
  }
}

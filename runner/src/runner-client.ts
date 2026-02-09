import { io, Socket } from 'socket.io-client';
import { Config } from './config';
import { PairingCodeGenerator } from './pairing-code-generator';
import { logger } from './logger';

/**
 * Error codes for runner operations
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.5
 */
export enum RunnerErrorCode {
  DUPLICATE_CODE = 'DUPLICATE_CODE',
  INVALID_SECRET = 'INVALID_SECRET',
  INVALID_FORMAT = 'INVALID_FORMAT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  REGISTRATION_FAILED = 'REGISTRATION_FAILED',
}

/**
 * Retry configuration for exponential backoff
 * 
 * Requirements: 10.2, 10.3
 */
interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

/**
 * RunnerClient
 * 
 * Manages the connection between a runner and the broker, including:
 * - Pairing code generation and registration
 * - Heartbeat mechanism to indicate online status
 * - Automatic reconnection with pairing code persistence
 * - Enhanced error handling and logging
 * - Exponential backoff for network errors
 * 
 * The pairing code persists across reconnections until the process exits,
 * allowing the runner to maintain the same pairing code during temporary
 * network interruptions.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.5, 2.3, 10.1, 10.2, 10.3, 10.5
 */
export class RunnerClient {
  private socket: Socket | null = null;
  private pairingCode: string | null = null;
  private codeGenerator = new PairingCodeGenerator();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isConnected = false;
  private registrationAttempts = 0;
  private readonly maxRegistrationAttempts = 3;
  private connectionAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private registrationRetryTimeout: NodeJS.Timeout | null = null;
  private registrationInFlight = false;
  
  /** Heartbeat interval in milliseconds (10 seconds) */
  private readonly HEARTBEAT_INTERVAL_MS = 10000;

  /** Retry configuration for exponential backoff */
  private readonly retryConfig: RetryConfig = {
    maxRetries: 5,
    initialDelay: 1000,      // 1 second
    maxDelay: 30000,         // 30 seconds
    backoffMultiplier: 2,
  };

  constructor(private config: Config) {}

  /**
   * Connect to the broker and register with a pairing code
   * 
   * This method:
   * 1. Establishes a WebSocket connection to the broker
   * 2. Generates a pairing code (or reuses existing one on reconnect)
   * 3. Registers the pairing code with the broker
   * 4. Starts sending periodic heartbeats
   * 5. Displays the pairing code in the console
   * 
   * The pairing code persists across reconnections until the process exits.
   * 
   * Requirements: 1.1, 1.2, 1.3, 1.5, 2.3, 10.2, 10.3
   */
  async connect(): Promise<void> {
    logger.info('Connecting to broker', {
      brokerUrl: this.config.brokerUrl,
      runnerId: this.config.runnerId,
    });
    console.log(`🔌 Connecting to broker: ${this.config.brokerUrl}`);

    this.socket = io(this.config.brokerUrl, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    this.setupEventHandlers();
  }

  /**
   * Set up socket event handlers
   * 
   * Handles connection, disconnection, registration responses, and errors.
   * Implements enhanced error handling and logging.
   * 
   * Requirements: 10.1, 10.2, 10.3, 10.5
   * 
   * @private
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Connection established
    this.socket.on('connect', () => {
      this.connectionAttempts++;
      
      logger.info('Connected to broker', {
        runnerId: this.config.runnerId,
        attempt: this.connectionAttempts,
      });
      console.log('✅ Connected to broker');
      
      this.isConnected = true;
      this.registrationAttempts = 0;
      this.clearRegistrationRetryTimeout();
      
      // Register with pairing code
      this.tryRegisterPairingCode('connect');
    });

    // Registration successful
    this.socket.on('runner:register:success', (data: { runnerId: string; pairingCode: string; message: string }) => {
      this.registrationInFlight = false;
      logger.info('Runner registered successfully', {
        runnerId: data.runnerId,
        pairingCode: this.pairingCode || undefined,
      });
      console.log(`✅ Runner registered successfully`);
      console.log(`   Runner ID: ${data.runnerId}`);
      
      // Display the pairing code prominently
      this.displayPairingCode();
      
      // Start heartbeat mechanism
      this.startHeartbeat();
    });

    // Registration failed
    this.socket.on('runner:register:error', (data: { error: string; message: string }) => {
      this.registrationInFlight = false;
      logger.error('Registration failed', {
        runnerId: this.config.runnerId,
        errorCode: data.error,
        pairingCode: this.pairingCode || undefined,
        attempt: this.registrationAttempts + 1,
      });
      console.error(`❌ Registration failed: ${data.message} (${data.error})`);
      
      // Handle different error types
      this.handleRegistrationError(data.error, data.message);
    });

    // Disconnection
    this.socket.on('disconnect', (reason: string) => {
      logger.warn('Disconnected from broker', {
        runnerId: this.config.runnerId,
        reason,
        pairingCode: this.pairingCode || undefined,
      });
      console.log(`❌ Disconnected from broker: ${reason}`);
      
      this.isConnected = false;
      this.registrationInFlight = false;
      this.clearRegistrationRetryTimeout();
      
      // Stop heartbeat
      this.stopHeartbeat();
      
      // Note: The pairing code is preserved for reconnection
      if (reason === 'io server disconnect') {
        // Server initiated disconnect - reconnect manually
        this.handleReconnect();
      }
      // For other reasons, socket.io will automatically reconnect
    });

    // Connection error
    this.socket.on('connect_error', (error: Error) => {
      logger.error('Connection error', {
        runnerId: this.config.runnerId,
        errorCode: RunnerErrorCode.NETWORK_ERROR,
      }, error);
      console.error(`❌ Connection error: ${error.message}`);
      
      // Handle network errors with exponential backoff
      this.handleNetworkError(error);
    });

    // Generic error
    this.socket.on('error', (data: { message: string }) => {
      logger.error('Server error', {
        runnerId: this.config.runnerId,
        errorMessage: data.message,
      });
      console.error(`❌ Server error: ${data.message}`);
    });
  }

  private tryRegisterPairingCode(trigger: 'connect' | 'retry'): void {
    if (!this.isConnected || !this.socket) {
      return;
    }

    if (this.registrationInFlight) {
      logger.debug('Skipping duplicate registration trigger', {
        runnerId: this.config.runnerId,
        trigger,
      });
      return;
    }

    this.registerPairingCode();
  }

  /**
   * Generate and register a pairing code with the broker
   * 
   * If a pairing code already exists (from a previous connection),
   * it will be reused. Otherwise, a new code is generated.
   * 
   * This ensures the pairing code persists across reconnections
   * until the process exits.
   * 
   * Requirements: 1.1, 1.2, 1.3, 1.5, 2.3, 10.1
   * 
   * @private
   */
  private registerPairingCode(): void {
    // Generate a new pairing code if we don't have one
    // (first connection or after collision retry)
    if (!this.pairingCode) {
      this.pairingCode = this.codeGenerator.generate();
      logger.info('Generated new pairing code', {
        runnerId: this.config.runnerId,
        pairingCode: this.pairingCode,
      });
      console.log(`🔑 Generated pairing code: ${this.pairingCode}`);
    } else {
      logger.info('Reusing existing pairing code', {
        runnerId: this.config.runnerId,
        pairingCode: this.pairingCode,
      });
      console.log(`🔑 Reusing pairing code: ${this.pairingCode}`);
    }

    // Send registration request to broker
    this.registrationInFlight = true;
    this.socket?.emit('runner:register', {
      runnerId: this.config.runnerId,
      pairingCode: this.pairingCode,
      secret: this.config.runnerSecret,
    });
  }

  /**
   * Handle registration errors
   * 
   * Implements retry logic for different error types:
   * - DUPLICATE_CODE: Generate new code and retry
   * - INVALID_SECRET: Fatal error, log and exit
   * - INVALID_FORMAT: Should not happen, log error
   * 
   * Requirements: 10.1, 10.2, 10.3
   * 
   * @private
   */
  private handleRegistrationError(errorCode: string, message: string): void {
    switch (errorCode) {
      case RunnerErrorCode.DUPLICATE_CODE:
        // Pairing code collision - generate a new code and retry
        logger.warn('Pairing code collision detected, generating new code', {
          runnerId: this.config.runnerId,
          pairingCode: this.pairingCode || undefined,
          attempt: this.registrationAttempts + 1,
        });
        console.log('🔄 Pairing code collision detected, generating new code...');
        
        this.pairingCode = null; // Clear the old code
        this.registrationAttempts++;
        this.registrationInFlight = false;
        this.clearRegistrationRetryTimeout();
        
        if (this.registrationAttempts < this.maxRegistrationAttempts) {
          // Retry with a new code after a short delay
          this.registrationRetryTimeout = setTimeout(() => {
            this.registrationRetryTimeout = null;
            this.tryRegisterPairingCode('retry');
          }, 1000);
        } else {
          logger.error('Failed to register after maximum attempts', {
            runnerId: this.config.runnerId,
            errorCode: RunnerErrorCode.REGISTRATION_FAILED,
            maxAttempts: this.maxRegistrationAttempts,
          });
          console.error('❌ Failed to register after multiple attempts. Please restart the runner.');
        }
        break;

      case RunnerErrorCode.INVALID_SECRET:
        this.registrationInFlight = false;
        // Fatal error - invalid configuration
        logger.error('Invalid runner secret - check configuration', {
          runnerId: this.config.runnerId,
          errorCode: RunnerErrorCode.INVALID_SECRET,
        });
        console.error('❌ Invalid runner secret. Please check your configuration.');
        console.error('   The runner cannot continue without a valid secret.');
        break;

      case RunnerErrorCode.INVALID_FORMAT:
        this.registrationInFlight = false;
        // Should not happen - indicates a bug in code generation
        logger.error('Invalid pairing code format - this should not happen', {
          runnerId: this.config.runnerId,
          errorCode: RunnerErrorCode.INVALID_FORMAT,
          pairingCode: this.pairingCode || undefined,
        });
        console.error('❌ Invalid pairing code format. This indicates a bug.');
        break;

      default:
        this.registrationInFlight = false;
        // Unknown error
        logger.error('Unknown registration error', {
          runnerId: this.config.runnerId,
          errorCode,
          errorMessage: message,
        });
        console.error(`❌ Registration error: ${message}`);
        break;
    }
  }

  /**
   * Handle network errors with exponential backoff
   * 
   * Implements exponential backoff retry strategy for network errors.
   * The delay increases exponentially with each retry attempt.
   * 
   * Requirements: 10.2, 10.3
   * 
   * @private
   */
  private handleNetworkError(error: Error): void {
    // Calculate delay using exponential backoff
    const delay = Math.min(
      this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffMultiplier, this.connectionAttempts),
      this.retryConfig.maxDelay
    );

    if (this.connectionAttempts < this.retryConfig.maxRetries) {
      logger.warn('Network error, will retry with exponential backoff', {
        runnerId: this.config.runnerId,
        errorCode: RunnerErrorCode.NETWORK_ERROR,
        attempt: this.connectionAttempts,
        nextRetryDelay: delay,
      });
      console.log(`🔄 Network error. Retrying in ${delay / 1000} seconds... (attempt ${this.connectionAttempts}/${this.retryConfig.maxRetries})`);
    } else {
      logger.error('Network error - maximum retry attempts reached', {
        runnerId: this.config.runnerId,
        errorCode: RunnerErrorCode.NETWORK_ERROR,
        maxRetries: this.retryConfig.maxRetries,
      }, error);
      console.error(`❌ Network error: Maximum retry attempts (${this.retryConfig.maxRetries}) reached.`);
      console.error('   Please check your network connection and broker URL.');
    }
  }

  /**
   * Handle manual reconnection
   * 
   * Called when the server initiates a disconnect.
   * Implements a delayed reconnection to avoid overwhelming the server.
   * 
   * Requirements: 10.2, 10.3
   * 
   * @private
   */
  private handleReconnect(): void {
    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    // Calculate delay using exponential backoff
    const delay = Math.min(
      this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffMultiplier, this.connectionAttempts),
      this.retryConfig.maxDelay
    );

    logger.info('Scheduling reconnection', {
      runnerId: this.config.runnerId,
      delay,
      attempt: this.connectionAttempts,
    });
    console.log(`🔄 Reconnecting in ${delay / 1000} seconds...`);

    this.reconnectTimeout = setTimeout(() => {
      if (this.socket) {
        logger.info('Attempting to reconnect', {
          runnerId: this.config.runnerId,
        });
        this.socket.connect();
      }
    }, delay);
  }

  /**
   * Display the pairing code in the console
   * 
   * Shows the pairing code in a prominent, easy-to-read format
   * so users can easily share it with apps that need to connect.
   * 
   * Requirements: 2.1, 2.2
   * 
   * @private
   */
  private displayPairingCode(): void {
    if (!this.pairingCode) return;

    console.log('\n' + '='.repeat(50));
    console.log('📱 PAIRING CODE');
    console.log('='.repeat(50));
    console.log('');
    console.log(`   ${this.pairingCode}`);
    console.log('');
    console.log('   Share this code with apps to allow them to connect');
    console.log('   to this runner.');
    console.log('='.repeat(50) + '\n');
  }

  /**
   * Start sending periodic heartbeats to the broker
   * 
   * Heartbeats are sent every 10 seconds to indicate the runner is online.
   * The broker uses these heartbeats to determine if a runner is available
   * for pairing.
   * 
   * Requirements: 1.5
   * 
   * @private
   */
  private startHeartbeat(): void {
    // Clear any existing heartbeat interval
    this.stopHeartbeat();

    // Send initial heartbeat immediately
    this.sendHeartbeat();

    // Set up periodic heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop sending heartbeats
   * 
   * Called when disconnected from the broker.
   * 
   * @private
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private clearRegistrationRetryTimeout(): void {
    if (this.registrationRetryTimeout) {
      clearTimeout(this.registrationRetryTimeout);
      this.registrationRetryTimeout = null;
    }
  }

  /**
   * Send a heartbeat to the broker
   * 
   * @private
   */
  private sendHeartbeat(): void {
    if (!this.isConnected || !this.socket) return;

    this.socket.emit('runner:heartbeat', {
      runnerId: this.config.runnerId,
    });
  }

  /**
   * Disconnect from the broker
   * 
   * Stops heartbeats and closes the socket connection.
   * The pairing code is preserved in case of reconnection.
   * 
   * Requirements: 10.1
   */
  disconnect(): void {
    logger.info('Disconnecting from broker', {
      runnerId: this.config.runnerId,
    });
    console.log('👋 Disconnecting from broker...');
    
    this.stopHeartbeat();
    
    // Clear any pending reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.clearRegistrationRetryTimeout();
    this.registrationInFlight = false;
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isConnected = false;
  }

  /**
   * Get the current pairing code
   * 
   * @returns The current pairing code, or null if not yet generated
   */
  getPairingCode(): string | null {
    return this.pairingCode;
  }

  /**
   * Check if the runner is currently connected to the broker
   * 
   * @returns true if connected, false otherwise
   */
  isRunnerConnected(): boolean {
    return this.isConnected;
  }
}

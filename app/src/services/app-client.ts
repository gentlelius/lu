import { io, Socket } from 'socket.io-client';

/**
 * Error codes for app pairing operations
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */
export enum PairingErrorCode {
  // Pairing code related errors
  INVALID_FORMAT = 'INVALID_FORMAT',
  CODE_NOT_FOUND = 'CODE_NOT_FOUND',
  CODE_EXPIRED = 'CODE_EXPIRED',
  
  // Runner related errors
  RUNNER_OFFLINE = 'RUNNER_OFFLINE',
  
  // Rate limit errors
  RATE_LIMITED = 'RATE_LIMITED',
  
  // Session related errors
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  NOT_PAIRED = 'NOT_PAIRED',
  
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
}

/**
 * Pairing state interface
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */
export interface PairingState {
  isPaired: boolean;
  runnerId: string | null;
  runnerOnline: boolean;
  pairedAt: Date | null;
  error: string | null;
}

/**
 * App configuration interface
 * 
 * Requirements: 3.1
 */
export interface AppConfig {
  brokerUrl: string;
  jwtToken: string;
}

/**
 * Retry configuration for exponential backoff
 * 
 * Requirements: 10.6
 */
interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

/**
 * Pairing response interface
 */
interface PairingResponse {
  success: boolean;
  runnerId?: string;
  pairedAt?: string;
  error?: {
    code: PairingErrorCode;
    message: string;
    remainingBanTime?: number;
  };
}

/**
 * Pairing status response interface
 */
interface PairingStatusResponse {
  paired: boolean;
  runnerId?: string;
  runnerOnline?: boolean;
  pairedAt?: string;
}

/**
 * AppClient
 * 
 * Manages the connection between a React Native app and the broker, including:
 * - JWT authentication
 * - Pairing with runners using pairing codes
 * - Pairing status queries
 * - Unpairing from runners
 * - Automatic reconnection with pairing relationship restoration
 * - Enhanced error handling with user-friendly messages
 * - Exponential backoff for network errors
 * 
 * The pairing relationship persists across reconnections, allowing the app
 * to maintain its connection to a runner even during temporary network
 * interruptions.
 * 
 * Requirements: 3.1, 7.1, 8.1, 9.1, 9.5, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */
export class AppClient {
  private socket: Socket | null = null;
  private config: AppConfig | null = null;
  private pairingState: PairingState = {
    isPaired: false,
    runnerId: null,
    runnerOnline: false,
    pairedAt: null,
    error: null,
  };
  private isConnected = false;
  private connectionAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private eventListeners: Map<string, Set<(data: any) => void>> = new Map();

  /** Retry configuration for exponential backoff */
  private readonly retryConfig: RetryConfig = {
    maxRetries: 5,
    initialDelay: 1000,      // 1 second
    maxDelay: 30000,         // 30 seconds
    backoffMultiplier: 2,
  };

  /**
   * Connect to the broker with JWT authentication
   * 
   * This method:
   * 1. Establishes a WebSocket connection to the broker
   * 2. Authenticates using the provided JWT token
   * 3. Sets up event handlers for pairing and reconnection
   * 4. Automatically restores pairing relationship on reconnect
   * 
   * Requirements: 3.1, 9.1, 9.5, 10.2, 10.3
   * 
   * @param config - App configuration with broker URL and JWT token
   * @returns Promise that resolves when connected and authenticated
   */
  async connect(config: AppConfig): Promise<void> {
    this.config = config;

    console.log(`🔌 Connecting to broker: ${config.brokerUrl}`);

    return new Promise((resolve, reject) => {
      this.socket = io(config.brokerUrl, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        transports: ['websocket'], // Force WebSocket for React Native
        auth: {
          token: config.jwtToken,
        },
      });

      this.setupEventHandlers(resolve, reject);
    });
  }

  /**
   * Set up socket event handlers
   * 
   * Handles connection, disconnection, authentication, pairing responses,
   * and runner status updates. Implements enhanced error handling and
   * automatic reconnection with pairing restoration.
   * 
   * Requirements: 9.1, 9.3, 9.5, 10.1, 10.2, 10.3, 10.6
   * 
   * @private
   */
  private setupEventHandlers(
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    if (!this.socket) return;

    // Connection established
    this.socket.on('connect', () => {
      this.connectionAttempts++;
      console.log('✅ Connected to broker');
      this.isConnected = true;

      // On reconnection, restore pairing relationship
      if (this.connectionAttempts > 1 && this.pairingState.isPaired) {
        console.log('🔄 Reconnected - restoring pairing relationship...');
        this.restorePairingRelationship();
      }
    });

    // Authentication successful
    this.socket.on('app:authenticated', (data: { message: string }) => {
      console.log('✅ App authenticated successfully');
      resolve();
    });

    // Authentication failed
    this.socket.on('app:auth:error', (data: { error: string; message: string }) => {
      console.error(`❌ Authentication failed: ${data.message}`);
      this.pairingState.error = data.message;
      reject(new Error(data.message));
    });

    // Pairing successful
    this.socket.on('app:pair:success', (data: { runnerId: string; pairedAt: string }) => {
      console.log(`✅ Paired successfully with runner: ${data.runnerId}`);
      this.pairingState = {
        isPaired: true,
        runnerId: data.runnerId,
        runnerOnline: true,
        pairedAt: new Date(data.pairedAt),
        error: null,
      };
      this.emitEvent('pairing:success', this.pairingState);
    });

    // Pairing failed
    this.socket.on('app:pair:error', (data: {
      error: string;
      code: PairingErrorCode;
      remainingBanTime?: number;
    }) => {
      console.error(`❌ Pairing failed: ${data.error} (${data.code})`);
      
      const errorMessage = this.getUserFriendlyErrorMessage(data.code, data.remainingBanTime);
      this.pairingState.error = errorMessage;
      
      this.emitEvent('pairing:error', {
        code: data.code,
        message: errorMessage,
        remainingBanTime: data.remainingBanTime,
      });
    });

    // Pairing status response
    this.socket.on('app:pairing:status:response', (data: PairingStatusResponse) => {
      if (data.paired && data.runnerId) {
        this.pairingState = {
          isPaired: true,
          runnerId: data.runnerId,
          runnerOnline: data.runnerOnline ?? false,
          pairedAt: data.pairedAt ? new Date(data.pairedAt) : null,
          error: null,
        };
        console.log(`📊 Pairing status: Paired with ${data.runnerId} (${data.runnerOnline ? 'online' : 'offline'})`);
      } else {
        this.pairingState = {
          isPaired: false,
          runnerId: null,
          runnerOnline: false,
          pairedAt: null,
          error: null,
        };
        console.log('📊 Pairing status: Not paired');
      }
      this.emitEvent('pairing:status', this.pairingState);
    });

    // Unpair successful
    this.socket.on('app:unpair:success', () => {
      console.log('✅ Unpaired successfully');
      this.pairingState = {
        isPaired: false,
        runnerId: null,
        runnerOnline: false,
        pairedAt: null,
        error: null,
      };
      this.emitEvent('pairing:unpaired', this.pairingState);
    });

    // Runner came online
    this.socket.on('runner:online', (data: { runnerId: string }) => {
      console.log(`🟢 Runner ${data.runnerId} is now online`);
      if (this.pairingState.runnerId === data.runnerId) {
        this.pairingState.runnerOnline = true;
        this.emitEvent('runner:online', { runnerId: data.runnerId });
      }
    });

    // Runner went offline
    this.socket.on('runner:offline', (data: { runnerId: string }) => {
      console.log(`🔴 Runner ${data.runnerId} is now offline`);
      if (this.pairingState.runnerId === data.runnerId) {
        this.pairingState.runnerOnline = false;
        this.emitEvent('runner:offline', { runnerId: data.runnerId });
      }
    });

    // Disconnection
    this.socket.on('disconnect', (reason: string) => {
      console.log(`❌ Disconnected from broker: ${reason}`);
      this.isConnected = false;

      // Note: Pairing state is preserved for reconnection
      if (reason === 'io server disconnect') {
        // Server initiated disconnect - reconnect manually
        this.handleReconnect();
      }
      // For other reasons, socket.io will automatically reconnect
    });

    // Connection error
    this.socket.on('connect_error', (error: Error) => {
      console.error(`❌ Connection error: ${error.message}`);
      
      if (this.connectionAttempts === 0) {
        // First connection attempt failed
        reject(error);
      } else {
        // Reconnection failed - handle with exponential backoff
        this.handleNetworkError(error);
      }
    });

    // Generic error
    this.socket.on('error', (data: { message: string }) => {
      console.error(`❌ Server error: ${data.message}`);
      this.pairingState.error = data.message;
      this.emitEvent('error', { message: data.message });
    });
  }

  /**
   * Send a pairing request with a pairing code
   * 
   * Validates the pairing code format and sends a pairing request to the broker.
   * The broker will verify the code, check if the runner is online, and create
   * a pairing session if successful.
   * 
   * Requirements: 3.1, 10.1, 10.2, 10.3, 10.4, 10.5
   * 
   * @param pairingCode - The pairing code in format XXX-XXX-XXX
   * @returns Promise that resolves when the pairing response is received
   */
  async pair(pairingCode: string): Promise<void> {
    if (!this.socket || !this.isConnected) {
      throw new Error('Not connected to broker. Please connect first.');
    }

    // Validate pairing code format
    const codePattern = /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/;
    if (!codePattern.test(pairingCode)) {
      const error = 'Invalid pairing code format. Expected format: XXX-XXX-XXX';
      this.pairingState.error = error;
      this.emitEvent('pairing:error', {
        code: PairingErrorCode.INVALID_FORMAT,
        message: error,
      });
      throw new Error(error);
    }

    console.log(`🔗 Sending pairing request with code: ${pairingCode}`);
    
    return new Promise((resolve, reject) => {
      // Set up one-time listeners for the response
      const successHandler = (data: { runnerId: string; pairedAt: string }) => {
        this.socket?.off('app:pair:error', errorHandler);
        resolve();
      };

      const errorHandler = (data: {
        error: string;
        code: PairingErrorCode;
        remainingBanTime?: number;
      }) => {
        this.socket?.off('app:pair:success', successHandler);
        reject(new Error(this.getUserFriendlyErrorMessage(data.code, data.remainingBanTime)));
      };

      this.socket?.once('app:pair:success', successHandler);
      this.socket?.once('app:pair:error', errorHandler);

      // Send pairing request
      this.socket?.emit('app:pair', { pairingCode });
    });
  }

  /**
   * Query the current pairing status
   * 
   * Requests the current pairing status from the broker, including whether
   * the app is paired, the runner ID, and whether the runner is online.
   * 
   * Requirements: 7.1, 7.2, 7.3, 7.4
   * 
   * @returns Promise that resolves with the current pairing state
   */
  async getPairingStatus(): Promise<PairingState> {
    if (!this.socket || !this.isConnected) {
      throw new Error('Not connected to broker. Please connect first.');
    }

    console.log('📊 Querying pairing status...');

    return new Promise((resolve) => {
      // Set up one-time listener for the response
      const handler = (data: PairingStatusResponse) => {
        resolve(this.pairingState);
      };

      this.socket?.once('app:pairing:status:response', handler);

      // Send status query
      this.socket?.emit('app:pairing:status');
    });
  }

  /**
   * Unpair from the current runner
   * 
   * Removes the pairing relationship with the current runner. After unpairing,
   * the app can no longer send commands to the runner, but the runner's pairing
   * code remains valid for other apps to use.
   * 
   * Requirements: 8.1, 8.2, 8.3, 8.4
   * 
   * @returns Promise that resolves when unpaired successfully
   */
  async unpair(): Promise<void> {
    if (!this.socket || !this.isConnected) {
      throw new Error('Not connected to broker. Please connect first.');
    }

    if (!this.pairingState.isPaired) {
      throw new Error('Not currently paired with any runner.');
    }

    console.log(`🔓 Unpairing from runner: ${this.pairingState.runnerId}`);

    return new Promise((resolve) => {
      // Set up one-time listener for the response
      const handler = () => {
        resolve();
      };

      this.socket?.once('app:unpair:success', handler);

      // Send unpair request
      this.socket?.emit('app:unpair');
    });
  }

  /**
   * Restore pairing relationship after reconnection
   * 
   * Called automatically when the app reconnects to the broker.
   * Queries the pairing status to restore the pairing relationship
   * if the runner is still online.
   * 
   * Requirements: 9.1, 9.5
   * 
   * @private
   */
  private async restorePairingRelationship(): Promise<void> {
    try {
      await this.getPairingStatus();
      if (this.pairingState.isPaired) {
        console.log(`✅ Pairing relationship restored with runner: ${this.pairingState.runnerId}`);
        this.emitEvent('pairing:restored', this.pairingState);
      } else {
        console.log('ℹ️ No pairing relationship to restore');
      }
    } catch (error) {
      console.error('❌ Failed to restore pairing relationship:', error);
    }
  }

  /**
   * Handle manual reconnection with exponential backoff
   * 
   * Called when the server initiates a disconnect.
   * Implements a delayed reconnection to avoid overwhelming the server.
   * 
   * Requirements: 10.2, 10.3, 10.6
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

    console.log(`🔄 Reconnecting in ${delay / 1000} seconds...`);

    this.reconnectTimeout = setTimeout(() => {
      if (this.socket) {
        console.log('🔄 Attempting to reconnect...');
        this.socket.connect();
      }
    }, delay);
  }

  /**
   * Handle network errors with exponential backoff
   * 
   * Implements exponential backoff retry strategy for network errors.
   * The delay increases exponentially with each retry attempt.
   * 
   * Requirements: 10.2, 10.3, 10.6
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
      console.log(`🔄 Network error. Retrying in ${delay / 1000} seconds... (attempt ${this.connectionAttempts}/${this.retryConfig.maxRetries})`);
    } else {
      console.error(`❌ Network error: Maximum retry attempts (${this.retryConfig.maxRetries}) reached.`);
      console.error('   Please check your network connection and broker URL.');
      this.emitEvent('error', {
        code: PairingErrorCode.NETWORK_ERROR,
        message: 'Maximum retry attempts reached. Please check your network connection.',
      });
    }
  }

  /**
   * Get user-friendly error message for error codes
   * 
   * Converts technical error codes into user-friendly messages that can
   * be displayed in the UI.
   * 
   * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
   * 
   * @private
   */
  private getUserFriendlyErrorMessage(code: PairingErrorCode, remainingBanTime?: number): string {
    switch (code) {
      case PairingErrorCode.INVALID_FORMAT:
        return 'Invalid pairing code format. Please check the code and try again.';
      
      case PairingErrorCode.CODE_NOT_FOUND:
        return 'Pairing code not found. Please check the code and try again.';
      
      case PairingErrorCode.CODE_EXPIRED:
        return 'This pairing code has expired. Please request a new code from the runner.';
      
      case PairingErrorCode.RUNNER_OFFLINE:
        return 'The runner is currently offline. Please make sure the runner is running and try again.';
      
      case PairingErrorCode.RATE_LIMITED:
        const timeMsg = remainingBanTime 
          ? ` Please try again in ${remainingBanTime} seconds.`
          : ' Please try again later.';
        return `Too many failed pairing attempts.${timeMsg}`;
      
      case PairingErrorCode.SESSION_NOT_FOUND:
        return 'Session not found. Please reconnect and try again.';
      
      case PairingErrorCode.NOT_PAIRED:
        return 'You are not currently paired with any runner.';
      
      case PairingErrorCode.NETWORK_ERROR:
        return 'Network error. Please check your internet connection and try again.';
      
      case PairingErrorCode.TIMEOUT:
        return 'Request timed out. Please try again.';
      
      case PairingErrorCode.CONNECTION_ERROR:
        return 'Connection error. Please check your internet connection and try again.';
      
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }

  /**
   * Register an event listener
   * 
   * Available events:
   * - pairing:success - Pairing successful
   * - pairing:error - Pairing failed
   * - pairing:status - Pairing status received
   * - pairing:unpaired - Unpaired successfully
   * - pairing:restored - Pairing relationship restored after reconnect
   * - runner:online - Runner came online
   * - runner:offline - Runner went offline
   * - error - Generic error
   * 
   * @param event - Event name
   * @param callback - Callback function
   */
  on(event: string, callback: (data: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)?.add(callback);
  }

  /**
   * Unregister an event listener
   * 
   * @param event - Event name
   * @param callback - Callback function to remove
   */
  off(event: string, callback: (data: any) => void): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  /**
   * Emit an event to all registered listeners
   * 
   * @private
   */
  private emitEvent(event: string, data: any): void {
    this.eventListeners.get(event)?.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  /**
   * Disconnect from the broker
   * 
   * Closes the socket connection and clears all state.
   * The pairing state is cleared, so reconnection will not restore
   * the pairing relationship.
   * 
   * Requirements: 10.1
   */
  disconnect(): void {
    console.log('👋 Disconnecting from broker...');
    
    // Clear any pending reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isConnected = false;
    this.pairingState = {
      isPaired: false,
      runnerId: null,
      runnerOnline: false,
      pairedAt: null,
      error: null,
    };
    this.eventListeners.clear();
  }

  /**
   * Get the current pairing state
   * 
   * @returns The current pairing state
   */
  getCurrentPairingState(): PairingState {
    return { ...this.pairingState };
  }

  /**
   * Check if the app is currently connected to the broker
   * 
   * @returns true if connected, false otherwise
   */
  isAppConnected(): boolean {
    return this.isConnected;
  }
}

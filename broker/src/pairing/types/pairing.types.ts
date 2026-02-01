/**
 * Shared type definitions for the pairing functionality
 * 
 * This file contains all the core data structures used across the pairing system:
 * - PairingCodeEntry: Configuration code registration information
 * - PairingSession: App-to-runner pairing session
 * - RateLimitEntry: Rate limiting tracking
 * - PairingHistoryEntry: Historical pairing event records
 * - PairingErrorCode: Standardized error codes
 */

/**
 * Pairing code registration information
 * Stored in Redis with key: pairing:code:{code}
 */
export interface PairingCodeEntry {
  /** The 9-character pairing code (format: XXX-XXX-XXX) */
  code: string;
  
  /** The unique identifier of the runner */
  runnerId: string;
  
  /** Timestamp when the code was created (milliseconds) */
  createdAt: number;
  
  /** Timestamp when the code expires (milliseconds) */
  expiresAt: number;
  
  /** Number of times this code has been successfully used */
  usedCount: number;
  
  /** Whether the code is currently active */
  isActive: boolean;
}

/**
 * Pairing session between an app and a runner
 * Stored in Redis with key: pairing:session:{appSessionId}
 */
export interface PairingSession {
  /** The unique identifier of the app's WebSocket session */
  appSessionId: string;
  
  /** The unique identifier of the paired runner */
  runnerId: string;
  
  /** Timestamp when the pairing was established (milliseconds) */
  pairedAt: number;
  
  /** Whether the session is currently active */
  isActive: boolean;
}

/**
 * Rate limiting entry for tracking failed pairing attempts
 * Uses Redis Sorted Set for sliding window implementation
 */
export interface RateLimitEntry {
  /** The unique identifier of the app's WebSocket session */
  appSessionId: string;
  
  /** Number of failed attempts in the current window */
  failedAttempts: number;
  
  /** Timestamp of the last failed attempt (milliseconds) */
  lastAttemptAt: number;
  
  /** Timestamp until which the session is banned (null if not banned) */
  bannedUntil: number | null;
}

/**
 * Historical record of a pairing event (success or failure)
 * Stored in Redis List with key: pairing:history
 */
export interface PairingHistoryEntry {
  /** Timestamp of the event (milliseconds) */
  timestamp: number;
  
  /** The unique identifier of the app's WebSocket session */
  appSessionId: string;
  
  /** The unique identifier of the runner (null if pairing failed) */
  runnerId: string | null;
  
  /** The pairing code that was attempted */
  pairingCode: string;
  
  /** Whether the pairing was successful */
  success: boolean;
  
  /** Error code if the pairing failed */
  errorCode?: PairingErrorCode;
}

/**
 * Standardized error codes for pairing operations
 */
export enum PairingErrorCode {
  // Pairing code related errors
  /** Pairing code format is invalid */
  INVALID_FORMAT = 'INVALID_FORMAT',
  
  /** Pairing code does not exist */
  CODE_NOT_FOUND = 'CODE_NOT_FOUND',
  
  /** Pairing code has expired */
  CODE_EXPIRED = 'CODE_EXPIRED',
  
  /** Pairing code already exists (during registration) */
  DUPLICATE_CODE = 'DUPLICATE_CODE',
  
  // Runner related errors
  /** Runner is offline */
  RUNNER_OFFLINE = 'RUNNER_OFFLINE',
  
  /** Runner secret validation failed */
  INVALID_SECRET = 'INVALID_SECRET',
  
  // Rate limiting errors
  /** Too many failed attempts, temporarily banned */
  RATE_LIMITED = 'RATE_LIMITED',
  
  // Session related errors
  /** Session does not exist */
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  
  /** App is not paired with any runner */
  NOT_PAIRED = 'NOT_PAIRED',
  
  // Network errors
  /** Network connection error */
  NETWORK_ERROR = 'NETWORK_ERROR',
  
  /** Request timeout */
  TIMEOUT = 'TIMEOUT',
}

/**
 * Error response format for pairing operations
 */
export interface PairingErrorResponse {
  success: false;
  error: {
    code: PairingErrorCode;
    message: string;
    details?: any;
  };
}

/**
 * Success response format for pairing operations
 */
export interface PairingSuccessResponse {
  success: true;
  data: any;
}

/**
 * Generic pairing response type
 */
export type PairingResponse = PairingSuccessResponse | PairingErrorResponse;

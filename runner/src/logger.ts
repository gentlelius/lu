/**
 * Logger utility for structured logging
 * 
 * Provides structured logging with different log levels and context.
 * Sensitive information (secrets, tokens) is automatically masked.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.5
 */

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

export interface LogContext {
  runnerId?: string;
  pairingCode?: string;
  errorCode?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  stack?: string;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;

  private constructor() {
    // Set log level from environment variable
    const envLogLevel = process.env.LOG_LEVEL?.toLowerCase();
    if (envLogLevel && Object.values(LogLevel).includes(envLogLevel as LogLevel)) {
      this.logLevel = envLogLevel as LogLevel;
    }
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Mask sensitive information in context
   * 
   * Masks:
   * - secret: completely hidden
   * - pairingCode: shows first and last group (e.g., ABC-***-XYZ)
   * - token: completely hidden
   */
  private maskSensitiveData(context: LogContext): LogContext {
    const masked = { ...context };

    // Mask secret
    if (masked.secret) {
      masked.secret = '***';
    }

    // Mask token
    if (masked.token) {
      masked.token = '***';
    }

    // Partially mask pairing code (show first and last group)
    if (masked.pairingCode && typeof masked.pairingCode === 'string') {
      const parts = masked.pairingCode.split('-');
      if (parts.length === 3) {
        masked.pairingCode = `${parts[0]}-***-${parts[2]}`;
      }
    }

    return masked;
  }

  /**
   * Check if a log level should be logged based on current log level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  /**
   * Format and output a log entry
   */
  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (context) {
      entry.context = this.maskSensitiveData(context);
    }

    if (error?.stack) {
      entry.stack = error.stack;
    }

    // Output as JSON for structured logging
    const output = JSON.stringify(entry);

    // Use appropriate console method based on level
    switch (level) {
      case LogLevel.ERROR:
        console.error(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      case LogLevel.INFO:
        console.info(output);
        break;
      case LogLevel.DEBUG:
        console.debug(output);
        break;
    }
  }

  error(message: string, context?: LogContext, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log a user-friendly message to console (not structured)
   * Used for important messages that should always be visible
   */
  console(message: string): void {
    console.log(message);
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

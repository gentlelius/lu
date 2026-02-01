import { Logger, LogLevel } from '../logger';

describe('Logger', () => {
  let logger: Logger;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleDebugSpy: jest.SpyInstance;

  beforeEach(() => {
    // Get logger instance
    logger = Logger.getInstance();
    
    // Spy on console methods
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
  });

  afterEach(() => {
    // Restore console methods
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = Logger.getInstance();
      const instance2 = Logger.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('error logging', () => {
    it('should log error messages', () => {
      logger.error('Test error message');
      
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const logOutput = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      
      expect(logOutput.level).toBe(LogLevel.ERROR);
      expect(logOutput.message).toBe('Test error message');
      expect(logOutput.timestamp).toBeDefined();
    });

    it('should log error with context', () => {
      logger.error('Test error', { runnerId: 'test-123', errorCode: 'TEST_ERROR' });
      
      const logOutput = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logOutput.context).toEqual({
        runnerId: 'test-123',
        errorCode: 'TEST_ERROR',
      });
    });

    it('should log error with stack trace', () => {
      const error = new Error('Test error');
      logger.error('Test error', {}, error);
      
      const logOutput = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logOutput.stack).toBeDefined();
      expect(logOutput.stack).toContain('Error: Test error');
    });
  });

  describe('warn logging', () => {
    it('should log warning messages', () => {
      logger.warn('Test warning');
      
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const logOutput = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
      
      expect(logOutput.level).toBe(LogLevel.WARN);
      expect(logOutput.message).toBe('Test warning');
    });
  });

  describe('info logging', () => {
    it('should log info messages', () => {
      logger.info('Test info');
      
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
      const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      
      expect(logOutput.level).toBe(LogLevel.INFO);
      expect(logOutput.message).toBe('Test info');
    });
  });

  describe('debug logging', () => {
    it('should not log debug messages by default', () => {
      logger.debug('Test debug');
      
      // Debug is not logged at INFO level (default)
      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });
  });

  describe('sensitive data masking', () => {
    it('should mask secret completely', () => {
      logger.error('Test error', { secret: 'my-secret-key' });
      
      const logOutput = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logOutput.context.secret).toBe('***');
    });

    it('should mask token completely', () => {
      logger.error('Test error', { token: 'my-jwt-token' });
      
      const logOutput = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logOutput.context.token).toBe('***');
    });

    it('should partially mask pairing code', () => {
      logger.error('Test error', { pairingCode: 'ABC-123-XYZ' });
      
      const logOutput = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logOutput.context.pairingCode).toBe('ABC-***-XYZ');
    });

    it('should not mask pairing code if format is invalid', () => {
      logger.error('Test error', { pairingCode: 'INVALID' });
      
      const logOutput = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logOutput.context.pairingCode).toBe('INVALID');
    });

    it('should mask multiple sensitive fields', () => {
      logger.error('Test error', {
        secret: 'my-secret',
        token: 'my-token',
        pairingCode: 'ABC-123-XYZ',
        runnerId: 'test-123',
      });
      
      const logOutput = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logOutput.context).toEqual({
        secret: '***',
        token: '***',
        pairingCode: 'ABC-***-XYZ',
        runnerId: 'test-123',
      });
    });
  });

  describe('structured logging format', () => {
    it('should output valid JSON', () => {
      logger.error('Test error', { runnerId: 'test-123' });
      
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(() => JSON.parse(logOutput)).not.toThrow();
    });

    it('should include timestamp in ISO format', () => {
      logger.error('Test error');
      
      const logOutput = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logOutput.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should include all required fields', () => {
      logger.error('Test error', { runnerId: 'test-123' });
      
      const logOutput = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logOutput).toHaveProperty('timestamp');
      expect(logOutput).toHaveProperty('level');
      expect(logOutput).toHaveProperty('message');
      expect(logOutput).toHaveProperty('context');
    });
  });

  describe('console method', () => {
    it('should output plain text without JSON formatting', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      
      logger.console('Plain text message');
      
      expect(consoleLogSpy).toHaveBeenCalledWith('Plain text message');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      
      consoleLogSpy.mockRestore();
    });
  });
});

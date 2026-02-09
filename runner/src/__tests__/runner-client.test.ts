import { RunnerClient, RunnerErrorCode } from '../runner-client';
import { Config } from '../config';
import { io } from 'socket.io-client';
import { logger } from '../logger';

// Mock socket.io-client
jest.mock('socket.io-client');

// Mock logger
jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    console: jest.fn(),
  },
}));

describe('RunnerClient', () => {
  let client: RunnerClient;
  let mockSocket: any;
  let config: Config;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock socket
    mockSocket = {
      on: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      connect: jest.fn(),
    };
    
    // Mock io to return our mock socket
    (io as jest.Mock).mockReturnValue(mockSocket);
    
    // Create test config
    config = {
      brokerUrl: 'http://localhost:3000',
      runnerId: 'test-runner-1',
      runnerSecret: 'test-secret',
    };
    
    // Create client
    client = new RunnerClient(config);
  });

  afterEach(() => {
    // Clean up any intervals
    client.disconnect();
  });

  describe('connect', () => {
    it('should create a socket connection with correct configuration', async () => {
      await client.connect();
      
      expect(io).toHaveBeenCalledWith(config.brokerUrl, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
      });
    });

    it('should set up event handlers', async () => {
      await client.connect();
      
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('runner:register:success', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('runner:register:error', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('registration', () => {
    it('should generate and register a pairing code on connect', async () => {
      await client.connect();
      
      // Simulate connection
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )[1];
      connectHandler();
      
      // Should emit registration request
      expect(mockSocket.emit).toHaveBeenCalledWith('runner:register', {
        runnerId: config.runnerId,
        pairingCode: expect.stringMatching(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/),
        secret: config.runnerSecret,
      });
    });

    it('should reuse the same pairing code on reconnect', async () => {
      await client.connect();
      
      // First connection
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )[1];
      const successHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'runner:register:success'
      )[1];
      connectHandler();
      
      const firstCode = mockSocket.emit.mock.calls[0][1].pairingCode;
      successHandler({
        runnerId: config.runnerId,
        pairingCode: firstCode,
        message: 'Success',
      });
      
      // Clear emit calls
      mockSocket.emit.mockClear();
      
      // Simulate reconnection
      connectHandler();
      
      const secondCode = mockSocket.emit.mock.calls[0][1].pairingCode;
      
      // Should be the same code
      expect(secondCode).toBe(firstCode);
    });

    it('should generate a new code on DUPLICATE_CODE error', async () => {
      jest.useFakeTimers();
      
      await client.connect();
      
      // First connection
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )[1];
      connectHandler();
      
      const firstCode = mockSocket.emit.mock.calls[0][1].pairingCode;
      
      // Simulate DUPLICATE_CODE error
      const errorHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'runner:register:error'
      )[1];
      errorHandler({ error: 'DUPLICATE_CODE', message: 'Code already exists' });
      
      // Clear emit calls
      mockSocket.emit.mockClear();
      
      // Fast-forward time to trigger retry
      jest.advanceTimersByTime(1000);
      
      const secondCode = mockSocket.emit.mock.calls[0][1].pairingCode;
      
      // Should be a different code
      expect(secondCode).not.toBe(firstCode);
      expect(secondCode).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/);
      
      jest.useRealTimers();
    });

    it('should stop retrying after max attempts', async () => {
      jest.useFakeTimers();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await client.connect();
      
      // First connection
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )[1];
      connectHandler();
      
      // Simulate DUPLICATE_CODE error
      const errorHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'runner:register:error'
      )[1];
      
      // Trigger 3 errors (max attempts)
      for (let i = 0; i < 3; i++) {
        errorHandler({ error: 'DUPLICATE_CODE', message: 'Code already exists' });
        jest.advanceTimersByTime(1000);
      }
      
      // Should have logged error about max attempts
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to register after multiple attempts')
      );
      
      consoleErrorSpy.mockRestore();
      jest.useRealTimers();
    });

    it('should not emit duplicate register when reconnect happens before scheduled retry', async () => {
      jest.useFakeTimers();

      await client.connect();

      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )[1];
      const errorHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'runner:register:error'
      )[1];

      // First connect/register, then collision schedules retry.
      connectHandler();
      errorHandler({ error: 'DUPLICATE_CODE', message: 'Code already exists' });

      mockSocket.emit.mockClear();

      // Reconnect fires before timeout callback runs.
      connectHandler();
      expect(mockSocket.emit).toHaveBeenCalledTimes(1);

      // Scheduled retry should be ignored because a registration is already in flight.
      jest.advanceTimersByTime(1000);
      expect(mockSocket.emit).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });
  });

  describe('heartbeat', () => {
    it('should start sending heartbeats after successful registration', async () => {
      jest.useFakeTimers();
      
      await client.connect();
      
      // Simulate connection
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )[1];
      connectHandler();
      
      // Simulate successful registration
      const successHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'runner:register:success'
      )[1];
      successHandler({
        runnerId: config.runnerId,
        pairingCode: 'ABC-123-XYZ',
        message: 'Success',
      });
      
      // Clear previous emit calls
      mockSocket.emit.mockClear();
      
      // Fast-forward 10 seconds
      jest.advanceTimersByTime(10000);
      
      // Should have sent a heartbeat
      expect(mockSocket.emit).toHaveBeenCalledWith('runner:heartbeat', {
        runnerId: config.runnerId,
      });
      
      jest.useRealTimers();
    });

    it('should send heartbeats every 10 seconds', async () => {
      jest.useFakeTimers();
      
      await client.connect();
      
      // Simulate connection and registration
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )[1];
      connectHandler();
      
      const successHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'runner:register:success'
      )[1];
      successHandler({
        runnerId: config.runnerId,
        pairingCode: 'ABC-123-XYZ',
        message: 'Success',
      });
      
      mockSocket.emit.mockClear();
      
      // Fast-forward 30 seconds
      jest.advanceTimersByTime(30000);
      
      // Should have sent 3 heartbeats (at 10s, 20s, 30s)
      const heartbeatCalls = mockSocket.emit.mock.calls.filter(
        (call: any) => call[0] === 'runner:heartbeat'
      );
      expect(heartbeatCalls.length).toBe(3);
      
      jest.useRealTimers();
    });

    it('should stop sending heartbeats on disconnect', async () => {
      jest.useFakeTimers();
      
      await client.connect();
      
      // Simulate connection and registration
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )[1];
      connectHandler();
      
      const successHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'runner:register:success'
      )[1];
      successHandler({
        runnerId: config.runnerId,
        pairingCode: 'ABC-123-XYZ',
        message: 'Success',
      });
      
      // Simulate disconnect
      const disconnectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'disconnect'
      )[1];
      disconnectHandler('transport close');
      
      mockSocket.emit.mockClear();
      
      // Fast-forward 30 seconds
      jest.advanceTimersByTime(30000);
      
      // Should not have sent any heartbeats
      const heartbeatCalls = mockSocket.emit.mock.calls.filter(
        (call: any) => call[0] === 'runner:heartbeat'
      );
      expect(heartbeatCalls.length).toBe(0);
      
      jest.useRealTimers();
    });
  });

  describe('disconnect', () => {
    it('should disconnect the socket', async () => {
      await client.connect();
      
      client.disconnect();
      
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should stop heartbeats on disconnect', async () => {
      jest.useFakeTimers();
      
      await client.connect();
      
      // Simulate connection and registration
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )[1];
      connectHandler();
      
      const successHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'runner:register:success'
      )[1];
      successHandler({
        runnerId: config.runnerId,
        pairingCode: 'ABC-123-XYZ',
        message: 'Success',
      });
      
      // Disconnect
      client.disconnect();
      
      mockSocket.emit.mockClear();
      
      // Fast-forward time
      jest.advanceTimersByTime(30000);
      
      // Should not send heartbeats
      expect(mockSocket.emit).not.toHaveBeenCalled();
      
      jest.useRealTimers();
    });
  });

  describe('getPairingCode', () => {
    it('should return null before connection', () => {
      expect(client.getPairingCode()).toBeNull();
    });

    it('should return the pairing code after registration', async () => {
      await client.connect();
      
      // Simulate connection
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )[1];
      connectHandler();
      
      const code = client.getPairingCode();
      expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    });
  });

  describe('isRunnerConnected', () => {
    it('should return false before connection', () => {
      expect(client.isRunnerConnected()).toBe(false);
    });

    it('should return true after connection', async () => {
      await client.connect();
      
      // Simulate connection
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )[1];
      connectHandler();
      
      expect(client.isRunnerConnected()).toBe(true);
    });

    it('should return false after disconnection', async () => {
      await client.connect();
      
      // Simulate connection
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )[1];
      connectHandler();
      
      // Simulate disconnect
      const disconnectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'disconnect'
      )[1];
      disconnectHandler('transport close');
      
      expect(client.isRunnerConnected()).toBe(false);
    });
  });

  describe('error handling', () => {
    describe('registration errors', () => {
      it('should log error for INVALID_SECRET', async () => {
        await client.connect();
        
        const connectHandler = mockSocket.on.mock.calls.find(
          (call: any) => call[0] === 'connect'
        )[1];
        connectHandler();
        
        const errorHandler = mockSocket.on.mock.calls.find(
          (call: any) => call[0] === 'runner:register:error'
        )[1];
        errorHandler({ error: 'INVALID_SECRET', message: 'Invalid secret' });
        
        expect(logger.error).toHaveBeenCalledWith(
          'Registration failed',
          expect.objectContaining({
            errorCode: 'INVALID_SECRET',
          })
        );
      });

      it('should log error for INVALID_FORMAT', async () => {
        await client.connect();
        
        const connectHandler = mockSocket.on.mock.calls.find(
          (call: any) => call[0] === 'connect'
        )[1];
        connectHandler();
        
        const errorHandler = mockSocket.on.mock.calls.find(
          (call: any) => call[0] === 'runner:register:error'
        )[1];
        errorHandler({ error: 'INVALID_FORMAT', message: 'Invalid format' });
        
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Invalid pairing code format'),
          expect.objectContaining({
            errorCode: RunnerErrorCode.INVALID_FORMAT,
          })
        );
      });

      it('should log error when max registration attempts reached', async () => {
        jest.useFakeTimers();
        
        await client.connect();
        
        const connectHandler = mockSocket.on.mock.calls.find(
          (call: any) => call[0] === 'connect'
        )[1];
        connectHandler();
        
        const errorHandler = mockSocket.on.mock.calls.find(
          (call: any) => call[0] === 'runner:register:error'
        )[1];
        
        // Trigger 3 DUPLICATE_CODE errors
        for (let i = 0; i < 3; i++) {
          errorHandler({ error: 'DUPLICATE_CODE', message: 'Code exists' });
          jest.advanceTimersByTime(1000);
        }
        
        expect(logger.error).toHaveBeenCalledWith(
          'Failed to register after maximum attempts',
          expect.objectContaining({
            errorCode: RunnerErrorCode.REGISTRATION_FAILED,
          })
        );
        
        jest.useRealTimers();
      });
    });

    describe('network errors', () => {
      it('should log network errors', async () => {
        await client.connect();
        
        const error = new Error('Network error');
        const errorHandler = mockSocket.on.mock.calls.find(
          (call: any) => call[0] === 'connect_error'
        )[1];
        errorHandler(error);
        
        expect(logger.error).toHaveBeenCalledWith(
          'Connection error',
          expect.objectContaining({
            errorCode: RunnerErrorCode.NETWORK_ERROR,
          }),
          error
        );
      });

      it('should log warning for network errors with retry info', async () => {
        await client.connect();
        
        // Simulate connection to increment attempt counter
        const connectHandler = mockSocket.on.mock.calls.find(
          (call: any) => call[0] === 'connect'
        )[1];
        connectHandler();
        
        const error = new Error('Network error');
        const errorHandler = mockSocket.on.mock.calls.find(
          (call: any) => call[0] === 'connect_error'
        )[1];
        errorHandler(error);
        
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Network error'),
          expect.objectContaining({
            errorCode: RunnerErrorCode.NETWORK_ERROR,
            nextRetryDelay: expect.any(Number),
          })
        );
      });
    });

    describe('disconnection handling', () => {
      it('should log disconnection events', async () => {
        await client.connect();
        
        const connectHandler = mockSocket.on.mock.calls.find(
          (call: any) => call[0] === 'connect'
        )[1];
        connectHandler();
        
        const disconnectHandler = mockSocket.on.mock.calls.find(
          (call: any) => call[0] === 'disconnect'
        )[1];
        disconnectHandler('transport close');
        
        expect(logger.warn).toHaveBeenCalledWith(
          'Disconnected from broker',
          expect.objectContaining({
            reason: 'transport close',
          })
        );
      });

      it('should schedule reconnection on server disconnect', async () => {
        jest.useFakeTimers();
        
        await client.connect();
        
        const connectHandler = mockSocket.on.mock.calls.find(
          (call: any) => call[0] === 'connect'
        )[1];
        connectHandler();
        
        const disconnectHandler = mockSocket.on.mock.calls.find(
          (call: any) => call[0] === 'disconnect'
        )[1];
        disconnectHandler('io server disconnect');
        
        // Should log reconnection scheduling
        expect(logger.info).toHaveBeenCalledWith(
          'Scheduling reconnection',
          expect.objectContaining({
            delay: expect.any(Number),
          })
        );
        
        jest.useRealTimers();
      });
    });

    describe('successful operations logging', () => {
      it('should log successful connection', async () => {
        await client.connect();
        
        const connectHandler = mockSocket.on.mock.calls.find(
          (call: any) => call[0] === 'connect'
        )[1];
        connectHandler();
        
        expect(logger.info).toHaveBeenCalledWith(
          'Connected to broker',
          expect.objectContaining({
            runnerId: config.runnerId,
          })
        );
      });

      it('should log successful registration', async () => {
        await client.connect();
        
        const connectHandler = mockSocket.on.mock.calls.find(
          (call: any) => call[0] === 'connect'
        )[1];
        connectHandler();
        
        const successHandler = mockSocket.on.mock.calls.find(
          (call: any) => call[0] === 'runner:register:success'
        )[1];
        successHandler({
          runnerId: config.runnerId,
          pairingCode: 'ABC-123-XYZ',
          message: 'Success',
        });
        
        expect(logger.info).toHaveBeenCalledWith(
          'Runner registered successfully',
          expect.objectContaining({
            runnerId: config.runnerId,
          })
        );
      });

      it('should log pairing code generation', async () => {
        await client.connect();
        
        const connectHandler = mockSocket.on.mock.calls.find(
          (call: any) => call[0] === 'connect'
        )[1];
        connectHandler();
        
        expect(logger.info).toHaveBeenCalledWith(
          'Generated new pairing code',
          expect.objectContaining({
            runnerId: config.runnerId,
            pairingCode: expect.stringMatching(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/),
          })
        );
      });
    });
  });
});

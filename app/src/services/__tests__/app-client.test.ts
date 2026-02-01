import { AppClient, PairingErrorCode, PairingState, AppConfig } from '../app-client';
import { io, Socket } from 'socket.io-client';

// Mock socket.io-client
jest.mock('socket.io-client');

describe('AppClient', () => {
  let appClient: AppClient;
  let mockSocket: any;
  let mockConfig: AppConfig;

  beforeEach(() => {
    // Create a mock socket
    mockSocket = {
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    };

    // Mock io to return our mock socket
    (io as jest.Mock).mockReturnValue(mockSocket);

    // Create test config
    mockConfig = {
      brokerUrl: 'http://localhost:3000',
      jwtToken: 'test-jwt-token',
    };

    // Create a new AppClient instance
    appClient = new AppClient();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connect', () => {
    it('should connect to broker with JWT authentication', async () => {
      // Arrange
      const connectPromise = appClient.connect(mockConfig);

      // Simulate successful connection
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();

      // Simulate successful authentication
      const authHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'app:authenticated'
      )?.[1];
      authHandler?.({ message: 'Authenticated' });

      // Assert
      await expect(connectPromise).resolves.toBeUndefined();
      expect(io).toHaveBeenCalledWith(mockConfig.brokerUrl, expect.objectContaining({
        auth: {
          token: mockConfig.jwtToken,
        },
        transports: ['websocket'],
      }));
    });

    it('should reject if authentication fails', async () => {
      // Arrange
      const connectPromise = appClient.connect(mockConfig);

      // Simulate authentication failure
      const authErrorHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'app:auth:error'
      )?.[1];
      authErrorHandler?.({ error: 'INVALID_TOKEN', message: 'Invalid JWT token' });

      // Assert
      await expect(connectPromise).rejects.toThrow('Invalid JWT token');
    });

    it('should set up event handlers', async () => {
      // Arrange & Act
      const connectPromise = appClient.connect(mockConfig);

      // Simulate successful connection and authentication
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();

      const authHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'app:authenticated'
      )?.[1];
      authHandler?.({ message: 'Authenticated' });

      await connectPromise;

      // Assert - check that all required event handlers are registered
      const registeredEvents = mockSocket.on.mock.calls.map((call: any[]) => call[0]);
      expect(registeredEvents).toContain('connect');
      expect(registeredEvents).toContain('app:authenticated');
      expect(registeredEvents).toContain('app:pair:success');
      expect(registeredEvents).toContain('app:pair:error');
      expect(registeredEvents).toContain('app:pairing:status:response');
      expect(registeredEvents).toContain('app:unpair:success');
      expect(registeredEvents).toContain('runner:online');
      expect(registeredEvents).toContain('runner:offline');
      expect(registeredEvents).toContain('disconnect');
      expect(registeredEvents).toContain('connect_error');
    });
  });

  describe('pair', () => {
    beforeEach(async () => {
      // Connect first
      const connectPromise = appClient.connect(mockConfig);
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      const authHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'app:authenticated'
      )?.[1];
      authHandler?.({ message: 'Authenticated' });
      await connectPromise;
    });

    it('should send pairing request with valid code', async () => {
      // Arrange
      const pairingCode = 'ABC-123-XYZ';
      const pairPromise = appClient.pair(pairingCode);

      // Simulate successful pairing
      const successHandler = mockSocket.once.mock.calls.find(
        (call: any[]) => call[0] === 'app:pair:success'
      )?.[1];
      successHandler?.({ runnerId: 'runner-123', pairedAt: new Date().toISOString() });

      // Assert
      await expect(pairPromise).resolves.toBeUndefined();
      expect(mockSocket.emit).toHaveBeenCalledWith('app:pair', { pairingCode });
    });

    it('should reject with invalid pairing code format', async () => {
      // Arrange
      const invalidCode = 'invalid-code';

      // Act & Assert
      await expect(appClient.pair(invalidCode)).rejects.toThrow('Invalid pairing code format');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('should handle CODE_NOT_FOUND error', async () => {
      // Arrange
      const pairingCode = 'ABC-123-XYZ';
      const pairPromise = appClient.pair(pairingCode);

      // Simulate pairing error
      const errorHandler = mockSocket.once.mock.calls.find(
        (call: any[]) => call[0] === 'app:pair:error'
      )?.[1];
      errorHandler?.({
        error: 'Code not found',
        code: PairingErrorCode.CODE_NOT_FOUND,
      });

      // Assert
      await expect(pairPromise).rejects.toThrow('Pairing code not found');
    });

    it('should handle CODE_EXPIRED error', async () => {
      // Arrange
      const pairingCode = 'ABC-123-XYZ';
      const pairPromise = appClient.pair(pairingCode);

      // Simulate pairing error
      const errorHandler = mockSocket.once.mock.calls.find(
        (call: any[]) => call[0] === 'app:pair:error'
      )?.[1];
      errorHandler?.({
        error: 'Code expired',
        code: PairingErrorCode.CODE_EXPIRED,
      });

      // Assert
      await expect(pairPromise).rejects.toThrow('This pairing code has expired');
    });

    it('should handle RUNNER_OFFLINE error', async () => {
      // Arrange
      const pairingCode = 'ABC-123-XYZ';
      const pairPromise = appClient.pair(pairingCode);

      // Simulate pairing error
      const errorHandler = mockSocket.once.mock.calls.find(
        (call: any[]) => call[0] === 'app:pair:error'
      )?.[1];
      errorHandler?.({
        error: 'Runner offline',
        code: PairingErrorCode.RUNNER_OFFLINE,
      });

      // Assert
      await expect(pairPromise).rejects.toThrow('The runner is currently offline');
    });

    it('should handle RATE_LIMITED error with remaining ban time', async () => {
      // Arrange
      const pairingCode = 'ABC-123-XYZ';
      const pairPromise = appClient.pair(pairingCode);

      // Simulate pairing error
      const errorHandler = mockSocket.once.mock.calls.find(
        (call: any[]) => call[0] === 'app:pair:error'
      )?.[1];
      errorHandler?.({
        error: 'Rate limited',
        code: PairingErrorCode.RATE_LIMITED,
        remainingBanTime: 120,
      });

      // Assert
      await expect(pairPromise).rejects.toThrow('Too many failed pairing attempts. Please try again in 120 seconds.');
    });

    it('should update pairing state on successful pairing', async () => {
      // Arrange
      const pairingCode = 'ABC-123-XYZ';
      const runnerId = 'runner-123';
      const pairedAt = new Date().toISOString();

      const pairPromise = appClient.pair(pairingCode);

      // Simulate successful pairing
      const successHandler = mockSocket.once.mock.calls.find(
        (call: any[]) => call[0] === 'app:pair:success'
      )?.[1];
      successHandler?.({ runnerId, pairedAt });

      await pairPromise;

      // Assert
      const state = appClient.getCurrentPairingState();
      expect(state.isPaired).toBe(true);
      expect(state.runnerId).toBe(runnerId);
      expect(state.runnerOnline).toBe(true);
      expect(state.error).toBeNull();
    });

    it('should throw error if not connected', async () => {
      // Arrange
      const disconnectedClient = new AppClient();

      // Act & Assert
      await expect(disconnectedClient.pair('ABC-123-XYZ')).rejects.toThrow('Not connected to broker');
    });
  });

  describe('getPairingStatus', () => {
    beforeEach(async () => {
      // Connect first
      const connectPromise = appClient.connect(mockConfig);
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      const authHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'app:authenticated'
      )?.[1];
      authHandler?.({ message: 'Authenticated' });
      await connectPromise;
    });

    it('should query pairing status', async () => {
      // Arrange
      const statusPromise = appClient.getPairingStatus();

      // Simulate status response
      const statusHandler = mockSocket.once.mock.calls.find(
        (call: any[]) => call[0] === 'app:pairing:status:response'
      )?.[1];
      statusHandler?.({
        paired: true,
        runnerId: 'runner-123',
        runnerOnline: true,
        pairedAt: new Date().toISOString(),
      });

      // Assert
      const state = await statusPromise;
      expect(mockSocket.emit).toHaveBeenCalledWith('app:pairing:status');
      expect(state.isPaired).toBe(true);
      expect(state.runnerId).toBe('runner-123');
      expect(state.runnerOnline).toBe(true);
    });

    it('should handle not paired status', async () => {
      // Arrange
      const statusPromise = appClient.getPairingStatus();

      // Simulate status response
      const statusHandler = mockSocket.once.mock.calls.find(
        (call: any[]) => call[0] === 'app:pairing:status:response'
      )?.[1];
      statusHandler?.({
        paired: false,
      });

      // Assert
      const state = await statusPromise;
      expect(state.isPaired).toBe(false);
      expect(state.runnerId).toBeNull();
      expect(state.runnerOnline).toBe(false);
    });

    it('should throw error if not connected', async () => {
      // Arrange
      const disconnectedClient = new AppClient();

      // Act & Assert
      await expect(disconnectedClient.getPairingStatus()).rejects.toThrow('Not connected to broker');
    });
  });

  describe('unpair', () => {
    beforeEach(async () => {
      // Connect first
      const connectPromise = appClient.connect(mockConfig);
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      const authHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'app:authenticated'
      )?.[1];
      authHandler?.({ message: 'Authenticated' });
      await connectPromise;

      // Pair first
      const pairPromise = appClient.pair('ABC-123-XYZ');
      const successHandler = mockSocket.once.mock.calls.find(
        (call: any[]) => call[0] === 'app:pair:success'
      )?.[1];
      successHandler?.({ runnerId: 'runner-123', pairedAt: new Date().toISOString() });
      await pairPromise;
    });

    it('should send unpair request', async () => {
      // Arrange
      const unpairPromise = appClient.unpair();

      // Simulate successful unpair
      const unpairHandler = mockSocket.once.mock.calls.find(
        (call: any[]) => call[0] === 'app:unpair:success'
      )?.[1];
      unpairHandler?.();

      // Assert
      await expect(unpairPromise).resolves.toBeUndefined();
      expect(mockSocket.emit).toHaveBeenCalledWith('app:unpair');
    });

    it('should update pairing state after unpair', async () => {
      // Arrange
      const unpairPromise = appClient.unpair();

      // Simulate successful unpair
      const unpairHandler = mockSocket.once.mock.calls.find(
        (call: any[]) => call[0] === 'app:unpair:success'
      )?.[1];
      unpairHandler?.();

      await unpairPromise;

      // Assert
      const state = appClient.getCurrentPairingState();
      expect(state.isPaired).toBe(false);
      expect(state.runnerId).toBeNull();
      expect(state.runnerOnline).toBe(false);
    });

    it('should throw error if not paired', async () => {
      // Arrange - create a new client that is not paired
      const newClient = new AppClient();
      const connectPromise = newClient.connect(mockConfig);
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      const authHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'app:authenticated'
      )?.[1];
      authHandler?.({ message: 'Authenticated' });
      await connectPromise;

      // Act & Assert
      await expect(newClient.unpair()).rejects.toThrow('Not currently paired with any runner');
    });

    it('should throw error if not connected', async () => {
      // Arrange
      const disconnectedClient = new AppClient();

      // Act & Assert
      await expect(disconnectedClient.unpair()).rejects.toThrow('Not connected to broker');
    });
  });

  describe('reconnection', () => {
    beforeEach(async () => {
      // Connect and pair first
      const connectPromise = appClient.connect(mockConfig);
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      const authHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'app:authenticated'
      )?.[1];
      authHandler?.({ message: 'Authenticated' });
      await connectPromise;

      const pairPromise = appClient.pair('ABC-123-XYZ');
      const successHandler = mockSocket.once.mock.calls.find(
        (call: any[]) => call[0] === 'app:pair:success'
      )?.[1];
      successHandler?.({ runnerId: 'runner-123', pairedAt: new Date().toISOString() });
      await pairPromise;
    });

    it('should restore pairing relationship on reconnect', async () => {
      // Arrange - simulate disconnect
      const disconnectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'disconnect'
      )?.[1];
      disconnectHandler?.('transport close');

      // Simulate reconnect
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();

      // Wait a bit for the status query to be sent
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate status response
      const statusHandler = mockSocket.once.mock.calls.find(
        (call: any[]) => call[0] === 'app:pairing:status:response'
      )?.[1];
      statusHandler?.({
        paired: true,
        runnerId: 'runner-123',
        runnerOnline: true,
        pairedAt: new Date().toISOString(),
      });

      // Wait a bit for the state to be updated
      await new Promise(resolve => setTimeout(resolve, 10));

      // Assert
      expect(mockSocket.emit).toHaveBeenCalledWith('app:pairing:status');
      const state = appClient.getCurrentPairingState();
      expect(state.isPaired).toBe(true);
      expect(state.runnerId).toBe('runner-123');
    });
  });

  describe('event listeners', () => {
    beforeEach(async () => {
      // Connect first
      const connectPromise = appClient.connect(mockConfig);
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      const authHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'app:authenticated'
      )?.[1];
      authHandler?.({ message: 'Authenticated' });
      await connectPromise;
    });

    it('should emit pairing:success event', async () => {
      // Arrange
      const listener = jest.fn();
      appClient.on('pairing:success', listener);

      const pairPromise = appClient.pair('ABC-123-XYZ');

      // Simulate successful pairing
      const successHandler = mockSocket.once.mock.calls.find(
        (call: any[]) => call[0] === 'app:pair:success'
      )?.[1];
      successHandler?.({ runnerId: 'runner-123', pairedAt: new Date().toISOString() });

      await pairPromise;

      // Assert
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        isPaired: true,
        runnerId: 'runner-123',
      }));
    });

    it('should emit pairing:error event', async () => {
      // Arrange
      const listener = jest.fn();
      appClient.on('pairing:error', listener);

      const pairPromise = appClient.pair('ABC-123-XYZ');

      // Simulate pairing error
      const errorHandler = mockSocket.once.mock.calls.find(
        (call: any[]) => call[0] === 'app:pair:error'
      )?.[1];
      errorHandler?.({
        error: 'Code not found',
        code: PairingErrorCode.CODE_NOT_FOUND,
      });

      await expect(pairPromise).rejects.toThrow();

      // Assert
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        code: PairingErrorCode.CODE_NOT_FOUND,
      }));
    });

    it('should emit runner:online event', () => {
      // Arrange
      const listener = jest.fn();
      appClient.on('runner:online', listener);

      // Pair first
      const pairPromise = appClient.pair('ABC-123-XYZ');
      const successHandler = mockSocket.once.mock.calls.find(
        (call: any[]) => call[0] === 'app:pair:success'
      )?.[1];
      successHandler?.({ runnerId: 'runner-123', pairedAt: new Date().toISOString() });

      // Simulate runner online event
      const onlineHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'runner:online'
      )?.[1];
      onlineHandler?.({ runnerId: 'runner-123' });

      // Assert
      expect(listener).toHaveBeenCalledWith({ runnerId: 'runner-123' });
    });

    it('should remove event listener with off', () => {
      // Arrange
      const listener = jest.fn();
      appClient.on('pairing:success', listener);
      appClient.off('pairing:success', listener);

      // Simulate pairing success
      const pairPromise = appClient.pair('ABC-123-XYZ');
      const successHandler = mockSocket.once.mock.calls.find(
        (call: any[]) => call[0] === 'app:pair:success'
      )?.[1];
      successHandler?.({ runnerId: 'runner-123', pairedAt: new Date().toISOString() });

      // Assert
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      // Connect first
      const connectPromise = appClient.connect(mockConfig);
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      const authHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'app:authenticated'
      )?.[1];
      authHandler?.({ message: 'Authenticated' });
      await connectPromise;
    });

    it('should disconnect from broker', () => {
      // Act
      appClient.disconnect();

      // Assert
      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(appClient.isAppConnected()).toBe(false);
    });

    it('should clear pairing state on disconnect', async () => {
      // Arrange - pair first
      const pairPromise = appClient.pair('ABC-123-XYZ');
      const successHandler = mockSocket.once.mock.calls.find(
        (call: any[]) => call[0] === 'app:pair:success'
      )?.[1];
      successHandler?.({ runnerId: 'runner-123', pairedAt: new Date().toISOString() });
      await pairPromise;

      // Act
      appClient.disconnect();

      // Assert
      const state = appClient.getCurrentPairingState();
      expect(state.isPaired).toBe(false);
      expect(state.runnerId).toBeNull();
    });
  });

  describe('utility methods', () => {
    it('should return current pairing state', () => {
      // Act
      const state = appClient.getCurrentPairingState();

      // Assert
      expect(state).toEqual({
        isPaired: false,
        runnerId: null,
        runnerOnline: false,
        pairedAt: null,
        error: null,
      });
    });

    it('should return connection status', async () => {
      // Arrange - not connected initially
      expect(appClient.isAppConnected()).toBe(false);

      // Connect
      const connectPromise = appClient.connect(mockConfig);
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      const authHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'app:authenticated'
      )?.[1];
      authHandler?.({ message: 'Authenticated' });
      await connectPromise;

      // Assert - connected
      expect(appClient.isAppConnected()).toBe(true);
    });
  });
});

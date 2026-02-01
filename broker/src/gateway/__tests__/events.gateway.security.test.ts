import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from '../events.gateway';
import { RunnerService } from '../../runner/runner.service';
import { AuthService } from '../../auth/auth.service';
import { PairingSessionService } from '../../pairing/pairing-session/pairing-session.service';
import { Socket } from 'socket.io';

/**
 * Security Tests for EventsGateway
 * 
 * These tests verify that the pairing verification security fix is working correctly.
 * 
 * Test Cases:
 * 1. Unauthenticated app cannot connect to runner
 * 2. Authenticated but unpaired app cannot connect to runner
 * 3. Paired app can connect to runner
 * 4. App cannot connect to a different runner than the one it's paired with
 */
describe('EventsGateway - Security Tests', () => {
  let gateway: EventsGateway;
  let pairingSessionService: PairingSessionService;
  let runnerService: RunnerService;
  let authService: AuthService;

  // Mock socket
  const createMockSocket = (id: string): Partial<Socket> => ({
    id,
    emit: jest.fn(),
    on: jest.fn(),
    disconnect: jest.fn(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsGateway,
        {
          provide: RunnerService,
          useValue: {
            getRunner: jest.fn(),
            registerRunner: jest.fn(),
            unregisterRunner: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            validateAppToken: jest.fn(),
            validateRunnerCredentials: jest.fn(),
          },
        },
        {
          provide: PairingSessionService,
          useValue: {
            isPairedByUserId: jest.fn(),
            getPairedRunnerByUserId: jest.fn(),
          },
        },
      ],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);
    pairingSessionService = module.get<PairingSessionService>(PairingSessionService);
    runnerService = module.get<RunnerService>(RunnerService);
    authService = module.get<AuthService>(AuthService);
  });

  describe('connect_runner security', () => {
    it('should reject connection from unauthenticated app', async () => {
      const mockSocket = createMockSocket('app-socket-1') as Socket;
      
      // Simulate unauthenticated app (no userId in socketToUser map)
      await gateway.handleConnectRunner(mockSocket, {
        runnerId: 'runner-1',
        sessionId: 'session-1',
      });

      // Should emit error
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Not authenticated. Please authenticate first.',
        code: 'NOT_AUTHENTICATED',
      });
    });

    it('should reject connection from unpaired app', async () => {
      const mockSocket = createMockSocket('app-socket-1') as Socket;
      const userId = 'user-123';
      
      // Simulate authenticated app
      gateway['socketToUser'].set(mockSocket.id, userId);
      
      // Mock: app is not paired with this runner
      jest.spyOn(pairingSessionService, 'isPairedByUserId').mockResolvedValue(false);

      await gateway.handleConnectRunner(mockSocket, {
        runnerId: 'runner-1',
        sessionId: 'session-1',
      });

      // Should check pairing
      expect(pairingSessionService.isPairedByUserId).toHaveBeenCalledWith(userId, 'runner-1');
      
      // Should emit error
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Not paired with this runner. Please pair first using a pairing code.',
        code: 'NOT_PAIRED',
      });
    });

    it('should allow connection from paired app', async () => {
      const mockSocket = createMockSocket('app-socket-1') as Socket;
      const userId = 'user-123';
      const runnerId = 'runner-1';
      const sessionId = 'session-1';
      
      // Simulate authenticated app
      gateway['socketToUser'].set(mockSocket.id, userId);
      
      // Mock: app is paired with this runner
      jest.spyOn(pairingSessionService, 'isPairedByUserId').mockResolvedValue(true);
      
      // Mock: runner is online
      const mockRunnerSocket = createMockSocket('runner-socket-1') as Socket;
      jest.spyOn(runnerService, 'getRunner').mockReturnValue({
        id: runnerId,
        socket: mockRunnerSocket,
        status: 'online',
        connectedAt: new Date(),
      });

      await gateway.handleConnectRunner(mockSocket, {
        runnerId,
        sessionId,
      });

      // Should check pairing
      expect(pairingSessionService.isPairedByUserId).toHaveBeenCalledWith(userId, runnerId);
      
      // Should NOT emit error
      expect(mockSocket.emit).not.toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ code: 'NOT_PAIRED' })
      );
      
      // Should create session
      expect(mockRunnerSocket.emit).toHaveBeenCalledWith('create_session', { sessionId });
      expect(mockSocket.emit).toHaveBeenCalledWith('session_created', { sessionId });
    });

    it('should reject connection to different runner than paired', async () => {
      const mockSocket = createMockSocket('app-socket-1') as Socket;
      const userId = 'user-123';
      
      // Simulate authenticated app
      gateway['socketToUser'].set(mockSocket.id, userId);
      
      // Mock: app is paired with runner-1, but trying to connect to runner-2
      jest.spyOn(pairingSessionService, 'isPairedByUserId').mockResolvedValue(false);

      await gateway.handleConnectRunner(mockSocket, {
        runnerId: 'runner-2',
        sessionId: 'session-1',
      });

      // Should check pairing with runner-2
      expect(pairingSessionService.isPairedByUserId).toHaveBeenCalledWith(userId, 'runner-2');
      
      // Should emit error
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Not paired with this runner. Please pair first using a pairing code.',
        code: 'NOT_PAIRED',
      });
    });

    it('should reject connection if runner is offline', async () => {
      const mockSocket = createMockSocket('app-socket-1') as Socket;
      const userId = 'user-123';
      
      // Simulate authenticated app
      gateway['socketToUser'].set(mockSocket.id, userId);
      
      // Mock: app is paired with this runner
      jest.spyOn(pairingSessionService, 'isPairedByUserId').mockResolvedValue(true);
      
      // Mock: runner is offline
      jest.spyOn(runnerService, 'getRunner').mockReturnValue(null);

      await gateway.handleConnectRunner(mockSocket, {
        runnerId: 'runner-1',
        sessionId: 'session-1',
      });

      // Should emit error
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Runner not found or offline',
      });
    });
  });

  describe('security logging', () => {
    it('should log security violations', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockSocket = createMockSocket('app-socket-1') as Socket;
      const userId = 'user-123';
      
      // Simulate authenticated app
      gateway['socketToUser'].set(mockSocket.id, userId);
      
      // Mock: app is not paired
      jest.spyOn(pairingSessionService, 'isPairedByUserId').mockResolvedValue(false);

      await gateway.handleConnectRunner(mockSocket, {
        runnerId: 'runner-1',
        sessionId: 'session-1',
      });

      // Should log security violation
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Security: User user-123 attempted to connect to unpaired runner runner-1')
      );

      consoleSpy.mockRestore();
    });
  });
});

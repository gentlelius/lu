import { Test, TestingModule } from '@nestjs/testing';
import { PairingGateway } from '../pairing.gateway';
import { PairingCodeService } from '../../pairing-code/pairing-code.service';
import { PairingSessionService } from '../../pairing-session/pairing-session.service';
import { RateLimitService } from '../../rate-limit/rate-limit.service';
import { PairingHistoryService } from '../../pairing-history/pairing-history.service';
import { Socket, Server } from 'socket.io';

/**
 * Tests for disconnect handling in PairingGateway
 * 
 * Validates Requirements 4.2, 4.4, 9.2:
 * - Runner disconnect: Invalidate pairing code, notify paired apps
 * - App disconnect: Preserve pairing relationship
 */
describe('PairingGateway - Disconnect Handling', () => {
  let gateway: PairingGateway;
  let pairingCodeService: PairingCodeService;
  let pairingSessionService: PairingSessionService;
  let mockServer: Partial<Server>;
  let mockRunnerSocket: Partial<Socket>;
  let mockAppSocket: Partial<Socket>;
  let emittedEvents: Map<string, Map<string, any>>;

  beforeEach(async () => {
    emittedEvents = new Map();

    // Create mock server with sockets map
    const mockSocketsMap = new Map<string, Socket>();
    
    mockServer = {
      sockets: {
        sockets: mockSocketsMap,
      } as any,
    };

    // Create mock runner socket
    mockRunnerSocket = {
      id: 'runner-socket-id',
      emit: jest.fn((event: string, data: any) => {
        if (!emittedEvents.has('runner-socket-id')) {
          emittedEvents.set('runner-socket-id', new Map());
        }
        emittedEvents.get('runner-socket-id')!.set(event, data);
        return true;
      }),
    };

    // Create mock app socket
    mockAppSocket = {
      id: 'app-socket-id',
      emit: jest.fn((event: string, data: any) => {
        if (!emittedEvents.has('app-socket-id')) {
          emittedEvents.set('app-socket-id', new Map());
        }
        emittedEvents.get('app-socket-id')!.set(event, data);
        return true;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PairingGateway,
        {
          provide: PairingCodeService,
          useValue: {
            registerCode: jest.fn(),
            validateCode: jest.fn(),
            invalidateCode: jest.fn(),
            findCodeByRunnerId: jest.fn(),
            incrementUsageCount: jest.fn(),
          },
        },
        {
          provide: PairingSessionService,
          useValue: {
            createSession: jest.fn(),
            getSession: jest.fn(),
            removeSession: jest.fn(),
            getAppsByRunnerId: jest.fn(),
            isRunnerOnline: jest.fn(),
            updateHeartbeat: jest.fn(),
            removeAllSessionsForRunner: jest.fn(),
          },
        },
        {
          provide: RateLimitService,
          useValue: {
            isBanned: jest.fn(),
            recordFailedAttempt: jest.fn(),
            reset: jest.fn(),
            getRemainingBanTime: jest.fn(),
          },
        },
        {
          provide: PairingHistoryService,
          useValue: {
            record: jest.fn(),
            getHistory: jest.fn(),
          },
        },
      ],
    }).compile();

    gateway = module.get<PairingGateway>(PairingGateway);
    pairingCodeService = module.get<PairingCodeService>(PairingCodeService);
    pairingSessionService = module.get<PairingSessionService>(PairingSessionService);

    // Set the server on the gateway
    gateway.server = mockServer as Server;
  });

  describe('Runner Disconnect', () => {
    it('should invalidate pairing code when runner disconnects', async () => {
      // Arrange
      const runnerId = 'test-runner-id';
      const pairingCode = 'ABC-123-XYZ';

      // Mock the services before registering
      jest.spyOn(pairingCodeService, 'registerCode').mockResolvedValue(undefined);
      jest.spyOn(pairingSessionService, 'updateHeartbeat').mockResolvedValue(undefined);

      // First register the runner
      await gateway.handleRunnerRegister(mockRunnerSocket as Socket, {
        runnerId,
        pairingCode,
        secret: 'test-secret',
      });

      jest.spyOn(pairingCodeService, 'findCodeByRunnerId').mockResolvedValue(pairingCode);
      jest.spyOn(pairingCodeService, 'invalidateCode').mockResolvedValue(undefined);
      jest.spyOn(pairingSessionService, 'removeAllSessionsForRunner').mockResolvedValue([]);

      // Act
      gateway.handleDisconnect(mockRunnerSocket as Socket);

      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      expect(pairingCodeService.findCodeByRunnerId).toHaveBeenCalledWith(runnerId);
      expect(pairingCodeService.invalidateCode).toHaveBeenCalledWith(pairingCode);
    });

    it('should notify all paired apps when runner disconnects', async () => {
      // Arrange
      const runnerId = 'test-runner-id';
      const pairingCode = 'ABC-123-XYZ';
      const pairedAppIds = ['app-1', 'app-2', 'app-3'];

      // Mock the services before registering
      jest.spyOn(pairingCodeService, 'registerCode').mockResolvedValue(undefined);
      jest.spyOn(pairingSessionService, 'updateHeartbeat').mockResolvedValue(undefined);

      // Register the runner
      await gateway.handleRunnerRegister(mockRunnerSocket as Socket, {
        runnerId,
        pairingCode,
        secret: 'test-secret',
      });

      // Create mock app sockets and add them to the server's socket map
      const mockAppSockets = pairedAppIds.map((appId) => {
        const socket = {
          id: `socket-${appId}`,
          emit: jest.fn(),
        } as Partial<Socket>;
        (mockServer.sockets!.sockets as Map<string, Socket>).set(
          `socket-${appId}`,
          socket as Socket,
        );
        return socket;
      });

      // Simulate apps being paired (store in gateway's internal map)
      pairedAppIds.forEach((appId, index) => {
        (gateway as any).socketToApp.set(`socket-${appId}`, appId);
      });

      jest.spyOn(pairingCodeService, 'findCodeByRunnerId').mockResolvedValue(pairingCode);
      jest.spyOn(pairingCodeService, 'invalidateCode').mockResolvedValue(undefined);
      jest.spyOn(pairingSessionService, 'removeAllSessionsForRunner').mockResolvedValue(pairedAppIds);

      // Act
      gateway.handleDisconnect(mockRunnerSocket as Socket);

      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      expect(pairingSessionService.removeAllSessionsForRunner).toHaveBeenCalledWith(runnerId);
      
      // Verify each app was notified
      mockAppSockets.forEach((socket) => {
        expect(socket.emit).toHaveBeenCalledWith('runner:offline', { runnerId });
      });
    });

    it('should remove all pairing sessions when runner disconnects', async () => {
      // Arrange
      const runnerId = 'test-runner-id';
      const pairingCode = 'ABC-123-XYZ';
      const pairedAppIds = ['app-1', 'app-2'];

      // Mock the services before registering
      jest.spyOn(pairingCodeService, 'registerCode').mockResolvedValue(undefined);
      jest.spyOn(pairingSessionService, 'updateHeartbeat').mockResolvedValue(undefined);

      // Register the runner
      await gateway.handleRunnerRegister(mockRunnerSocket as Socket, {
        runnerId,
        pairingCode,
        secret: 'test-secret',
      });

      jest.spyOn(pairingCodeService, 'findCodeByRunnerId').mockResolvedValue(pairingCode);
      jest.spyOn(pairingCodeService, 'invalidateCode').mockResolvedValue(undefined);
      jest.spyOn(pairingSessionService, 'removeAllSessionsForRunner').mockResolvedValue(pairedAppIds);

      // Act
      gateway.handleDisconnect(mockRunnerSocket as Socket);

      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      expect(pairingSessionService.removeAllSessionsForRunner).toHaveBeenCalledWith(runnerId);
    });

    it('should clean up internal mappings when runner disconnects', async () => {
      // Arrange
      const runnerId = 'test-runner-id';
      const pairingCode = 'ABC-123-XYZ';

      // Mock the services before registering
      jest.spyOn(pairingCodeService, 'registerCode').mockResolvedValue(undefined);
      jest.spyOn(pairingSessionService, 'updateHeartbeat').mockResolvedValue(undefined);

      // Register the runner
      await gateway.handleRunnerRegister(mockRunnerSocket as Socket, {
        runnerId,
        pairingCode,
        secret: 'test-secret',
      });

      // Verify runner is in internal maps
      expect((gateway as any).runnerSockets.has(runnerId)).toBe(true);
      expect((gateway as any).socketToRunner.has(mockRunnerSocket.id)).toBe(true);

      jest.spyOn(pairingCodeService, 'findCodeByRunnerId').mockResolvedValue(pairingCode);
      jest.spyOn(pairingCodeService, 'invalidateCode').mockResolvedValue(undefined);
      jest.spyOn(pairingSessionService, 'removeAllSessionsForRunner').mockResolvedValue([]);

      // Act
      gateway.handleDisconnect(mockRunnerSocket as Socket);

      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      expect((gateway as any).runnerSockets.has(runnerId)).toBe(false);
      expect((gateway as any).socketToRunner.has(mockRunnerSocket.id)).toBe(false);
    });

    it('should handle runner disconnect when no pairing code exists', async () => {
      // Arrange
      const runnerId = 'test-runner-id';
      const pairingCode = 'ABC-123-XYZ';

      // Mock the services before registering
      jest.spyOn(pairingCodeService, 'registerCode').mockResolvedValue(undefined);
      jest.spyOn(pairingSessionService, 'updateHeartbeat').mockResolvedValue(undefined);

      // Register the runner
      await gateway.handleRunnerRegister(mockRunnerSocket as Socket, {
        runnerId,
        pairingCode,
        secret: 'test-secret',
      });

      jest.spyOn(pairingCodeService, 'findCodeByRunnerId').mockResolvedValue(null);
      jest.spyOn(pairingCodeService, 'invalidateCode').mockResolvedValue(undefined);
      jest.spyOn(pairingSessionService, 'removeAllSessionsForRunner').mockResolvedValue([]);

      // Act
      gateway.handleDisconnect(mockRunnerSocket as Socket);

      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      expect(pairingCodeService.findCodeByRunnerId).toHaveBeenCalledWith(runnerId);
      expect(pairingCodeService.invalidateCode).not.toHaveBeenCalled();
      expect(pairingSessionService.removeAllSessionsForRunner).toHaveBeenCalledWith(runnerId);
    });

    it('should handle errors during runner disconnect gracefully', async () => {
      // Arrange
      const runnerId = 'test-runner-id';
      const pairingCode = 'ABC-123-XYZ';

      // Mock the services before registering
      jest.spyOn(pairingCodeService, 'registerCode').mockResolvedValue(undefined);
      jest.spyOn(pairingSessionService, 'updateHeartbeat').mockResolvedValue(undefined);

      // Register the runner
      await gateway.handleRunnerRegister(mockRunnerSocket as Socket, {
        runnerId,
        pairingCode,
        secret: 'test-secret',
      });

      jest.spyOn(pairingCodeService, 'findCodeByRunnerId').mockRejectedValue(new Error('Redis error'));

      // Act - should not throw
      expect(() => gateway.handleDisconnect(mockRunnerSocket as Socket)).not.toThrow();

      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });

  describe('App Disconnect', () => {
    it('should preserve pairing relationship when app disconnects', () => {
      // Arrange
      const appSessionId = 'test-app-id';
      
      // Simulate app being paired (store in gateway's internal map)
      (gateway as any).socketToApp.set(mockAppSocket.id, appSessionId);

      jest.spyOn(pairingSessionService, 'removeSession').mockResolvedValue(undefined);

      // Act
      gateway.handleDisconnect(mockAppSocket as Socket);

      // Assert
      // Verify that removeSession was NOT called (pairing relationship preserved)
      expect(pairingSessionService.removeSession).not.toHaveBeenCalled();
    });

    it('should clean up internal socket mapping when app disconnects', () => {
      // Arrange
      const appSessionId = 'test-app-id';
      
      // Simulate app being paired (store in gateway's internal map)
      (gateway as any).socketToApp.set(mockAppSocket.id, appSessionId);

      // Verify app is in internal map
      expect((gateway as any).socketToApp.has(mockAppSocket.id)).toBe(true);

      // Act
      gateway.handleDisconnect(mockAppSocket as Socket);

      // Assert
      expect((gateway as any).socketToApp.has(mockAppSocket.id)).toBe(false);
    });

    it('should handle app disconnect when app is not paired', () => {
      // Arrange - app socket not in internal map

      // Act - should not throw
      expect(() => gateway.handleDisconnect(mockAppSocket as Socket)).not.toThrow();
    });
  });

  describe('Unknown Client Disconnect', () => {
    it('should handle disconnect of unknown client gracefully', () => {
      // Arrange
      const unknownSocket = {
        id: 'unknown-socket-id',
        emit: jest.fn(),
      } as Partial<Socket>;

      // Act - should not throw
      expect(() => gateway.handleDisconnect(unknownSocket as Socket)).not.toThrow();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle runner disconnect with multiple paired apps', async () => {
      // Arrange
      const runnerId = 'test-runner-id';
      const pairingCode = 'ABC-123-XYZ';
      const pairedAppIds = ['app-1', 'app-2', 'app-3', 'app-4'];

      // Mock the services before registering
      jest.spyOn(pairingCodeService, 'registerCode').mockResolvedValue(undefined);
      jest.spyOn(pairingSessionService, 'updateHeartbeat').mockResolvedValue(undefined);

      // Register the runner
      await gateway.handleRunnerRegister(mockRunnerSocket as Socket, {
        runnerId,
        pairingCode,
        secret: 'test-secret',
      });

      // Create mock app sockets
      const mockAppSockets = pairedAppIds.map((appId) => {
        const socket = {
          id: `socket-${appId}`,
          emit: jest.fn(),
        } as Partial<Socket>;
        (mockServer.sockets!.sockets as Map<string, Socket>).set(
          `socket-${appId}`,
          socket as Socket,
        );
        (gateway as any).socketToApp.set(`socket-${appId}`, appId);
        return socket;
      });

      jest.spyOn(pairingCodeService, 'findCodeByRunnerId').mockResolvedValue(pairingCode);
      jest.spyOn(pairingCodeService, 'invalidateCode').mockResolvedValue(undefined);
      jest.spyOn(pairingSessionService, 'removeAllSessionsForRunner').mockResolvedValue(pairedAppIds);

      // Act
      gateway.handleDisconnect(mockRunnerSocket as Socket);

      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      // Verify pairing code was invalidated
      expect(pairingCodeService.invalidateCode).toHaveBeenCalledWith(pairingCode);
      
      // Verify all sessions were removed
      expect(pairingSessionService.removeAllSessionsForRunner).toHaveBeenCalledWith(runnerId);
      
      // Verify all apps were notified
      mockAppSockets.forEach((socket) => {
        expect(socket.emit).toHaveBeenCalledWith('runner:offline', { runnerId });
      });
      
      // Verify internal mappings were cleaned up
      expect((gateway as any).runnerSockets.has(runnerId)).toBe(false);
      expect((gateway as any).socketToRunner.has(mockRunnerSocket.id)).toBe(false);
    });

    it('should handle sequential disconnects correctly', async () => {
      // Arrange
      const runnerId = 'test-runner-id';
      const pairingCode = 'ABC-123-XYZ';
      const appSessionId = 'test-app-id';

      // Mock the services before registering
      jest.spyOn(pairingCodeService, 'registerCode').mockResolvedValue(undefined);
      jest.spyOn(pairingSessionService, 'updateHeartbeat').mockResolvedValue(undefined);

      // Register runner
      await gateway.handleRunnerRegister(mockRunnerSocket as Socket, {
        runnerId,
        pairingCode,
        secret: 'test-secret',
      });

      // Simulate app being paired
      (gateway as any).socketToApp.set(mockAppSocket.id, appSessionId);

      jest.spyOn(pairingCodeService, 'findCodeByRunnerId').mockResolvedValue(pairingCode);
      jest.spyOn(pairingCodeService, 'invalidateCode').mockResolvedValue(undefined);
      jest.spyOn(pairingSessionService, 'removeAllSessionsForRunner').mockResolvedValue([appSessionId]);

      // Act - disconnect app first
      gateway.handleDisconnect(mockAppSocket as Socket);
      
      // Assert - app mapping cleaned up, but session preserved
      expect((gateway as any).socketToApp.has(mockAppSocket.id)).toBe(false);
      expect(pairingSessionService.removeSession).not.toHaveBeenCalled();

      // Act - disconnect runner
      gateway.handleDisconnect(mockRunnerSocket as Socket);

      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Assert - runner cleaned up, code invalidated, sessions removed
      expect(pairingCodeService.invalidateCode).toHaveBeenCalledWith(pairingCode);
      expect(pairingSessionService.removeAllSessionsForRunner).toHaveBeenCalledWith(runnerId);
      expect((gateway as any).runnerSockets.has(runnerId)).toBe(false);
    });
  });
});

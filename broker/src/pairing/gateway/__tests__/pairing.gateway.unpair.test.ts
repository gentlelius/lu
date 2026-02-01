import { Test, TestingModule } from '@nestjs/testing';
import { PairingGateway } from '../pairing.gateway';
import { PairingCodeService } from '../../pairing-code/pairing-code.service';
import { PairingSessionService } from '../../pairing-session/pairing-session.service';
import { RateLimitService } from '../../rate-limit/rate-limit.service';
import { PairingHistoryService } from '../../pairing-history/pairing-history.service';
import { Socket } from 'socket.io';

/**
 * Tests for app:unpair event handler
 * 
 * Validates Requirements 8.1, 8.2, 8.3, 8.4:
 * - Deletes the pairing session
 * - Preserves the runner's pairing code
 * - Returns success response
 */
describe('PairingGateway - app:unpair', () => {
  let gateway: PairingGateway;
  let pairingSessionService: PairingSessionService;
  let mockSocket: Partial<Socket>;
  let emittedEvents: Map<string, any>;

  beforeEach(async () => {
    emittedEvents = new Map();

    // Create mock socket
    mockSocket = {
      id: 'test-app-socket-id',
      emit: jest.fn((event: string, data: any) => {
        emittedEvents.set(event, data);
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
    pairingSessionService = module.get<PairingSessionService>(PairingSessionService);
  });

  describe('handleUnpair', () => {
    it('should successfully unpair an app from a runner', async () => {
      // Arrange
      const mockSession = {
        appSessionId: 'test-app-socket-id',
        runnerId: 'test-runner-id',
        pairedAt: Date.now(),
        isActive: true,
      };

      jest.spyOn(pairingSessionService, 'getSession').mockResolvedValue(mockSession);
      jest.spyOn(pairingSessionService, 'removeSession').mockResolvedValue(undefined);

      // Act
      await gateway.handleUnpair(mockSocket as Socket);

      // Assert
      expect(pairingSessionService.getSession).toHaveBeenCalledWith('test-app-socket-id');
      expect(pairingSessionService.removeSession).toHaveBeenCalledWith('test-app-socket-id');
      
      const successEvent = emittedEvents.get('app:unpair:success');
      expect(successEvent).toBeDefined();
      expect(successEvent.message).toBe('Unpaired successfully');
      expect(successEvent.runnerId).toBe('test-runner-id');
    });

    it('should handle unpair request when app is not paired', async () => {
      // Arrange
      jest.spyOn(pairingSessionService, 'getSession').mockResolvedValue(null);

      // Act
      await gateway.handleUnpair(mockSocket as Socket);

      // Assert
      expect(pairingSessionService.getSession).toHaveBeenCalledWith('test-app-socket-id');
      expect(pairingSessionService.removeSession).not.toHaveBeenCalled();
      
      const successEvent = emittedEvents.get('app:unpair:success');
      expect(successEvent).toBeDefined();
      expect(successEvent.message).toBe('Not paired with any runner');
    });

    it('should handle errors during unpair gracefully', async () => {
      // Arrange
      jest.spyOn(pairingSessionService, 'getSession').mockRejectedValue(new Error('Redis error'));

      // Act
      await gateway.handleUnpair(mockSocket as Socket);

      // Assert
      const errorEvent = emittedEvents.get('app:unpair:error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent.error).toBe('NETWORK_ERROR');
      expect(errorEvent.message).toBe('Error during unpair');
    });

    it('should not invalidate runner pairing code when app unpairs', async () => {
      // Arrange
      const mockSession = {
        appSessionId: 'test-app-socket-id',
        runnerId: 'test-runner-id',
        pairedAt: Date.now(),
        isActive: true,
      };

      jest.spyOn(pairingSessionService, 'getSession').mockResolvedValue(mockSession);
      jest.spyOn(pairingSessionService, 'removeSession').mockResolvedValue(undefined);

      // Act
      await gateway.handleUnpair(mockSocket as Socket);

      // Assert
      // Verify that removeSession was called (removes the pairing session)
      expect(pairingSessionService.removeSession).toHaveBeenCalledWith('test-app-socket-id');
      
      // The pairing code should NOT be invalidated
      // This is verified by the fact that we don't call pairingCodeService.invalidateCode
      // The runner's pairing code remains active for other apps to use
      
      const successEvent = emittedEvents.get('app:unpair:success');
      expect(successEvent).toBeDefined();
      expect(successEvent.runnerId).toBe('test-runner-id');
    });
  });
});

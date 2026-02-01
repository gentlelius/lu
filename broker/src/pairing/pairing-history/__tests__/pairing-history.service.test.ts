import { Test, TestingModule } from '@nestjs/testing';
import { PairingHistoryService } from '../pairing-history.service';
import { RedisService } from '../../redis/redis.service';
import { PairingHistoryEntry, PairingErrorCode } from '../../types/pairing.types';
import RedisMock from 'ioredis-mock';

describe('PairingHistoryService', () => {
  let service: PairingHistoryService;
  let redisService: RedisService;
  let redisMock: InstanceType<typeof RedisMock>;

  beforeEach(async () => {
    // Create a fresh Redis mock for each test
    redisMock = new RedisMock();

    // Create a mock RedisService
    const mockRedisService = {
      getClient: jest.fn().mockReturnValue(redisMock),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PairingHistoryService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<PairingHistoryService>(PairingHistoryService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(async () => {
    // Clean up
    await redisMock.flushall();
  });

  describe('record', () => {
    it('should record a successful pairing event', async () => {
      // Arrange
      const entry: PairingHistoryEntry = {
        timestamp: Date.now(),
        appSessionId: 'app-session-123',
        runnerId: 'runner-456',
        pairingCode: 'ABC-123-XYZ',
        success: true,
      };

      // Act
      await service.record(entry);

      // Assert
      const history = await service.getHistory(10);
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(entry);
    });

    it('should record a failed pairing event with error code', async () => {
      // Arrange
      const entry: PairingHistoryEntry = {
        timestamp: Date.now(),
        appSessionId: 'app-session-789',
        runnerId: null,
        pairingCode: 'XYZ-789-ABC',
        success: false,
        errorCode: PairingErrorCode.CODE_NOT_FOUND,
      };

      // Act
      await service.record(entry);

      // Assert
      const history = await service.getHistory(10);
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(entry);
      expect(history[0].errorCode).toBe(PairingErrorCode.CODE_NOT_FOUND);
    });

    it('should record multiple events in order (most recent first)', async () => {
      // Arrange
      const entries: PairingHistoryEntry[] = [
        {
          timestamp: 1000,
          appSessionId: 'app-1',
          runnerId: 'runner-1',
          pairingCode: 'AAA-111-AAA',
          success: true,
        },
        {
          timestamp: 2000,
          appSessionId: 'app-2',
          runnerId: 'runner-2',
          pairingCode: 'BBB-222-BBB',
          success: true,
        },
        {
          timestamp: 3000,
          appSessionId: 'app-3',
          runnerId: null,
          pairingCode: 'CCC-333-CCC',
          success: false,
          errorCode: PairingErrorCode.CODE_EXPIRED,
        },
      ];

      // Act
      for (const entry of entries) {
        await service.record(entry);
      }

      // Assert
      const history = await service.getHistory(10);
      expect(history).toHaveLength(3);
      // Most recent first (reverse order)
      expect(history[0].timestamp).toBe(3000);
      expect(history[1].timestamp).toBe(2000);
      expect(history[2].timestamp).toBe(1000);
    });

    it('should maintain maximum of 1000 entries', async () => {
      // Arrange - Record 1100 entries
      const entries: PairingHistoryEntry[] = [];
      for (let i = 0; i < 1100; i++) {
        entries.push({
          timestamp: i,
          appSessionId: `app-${i}`,
          runnerId: `runner-${i}`,
          pairingCode: `CODE-${i}`,
          success: true,
        });
      }

      // Act
      for (const entry of entries) {
        await service.record(entry);
      }

      // Assert
      const count = await service.getHistoryCount();
      expect(count).toBe(1000);

      const history = await service.getHistory(1000);
      expect(history).toHaveLength(1000);

      // Verify most recent 1000 are kept (entries 100-1099)
      expect(history[0].timestamp).toBe(1099); // Most recent
      expect(history[999].timestamp).toBe(100); // Oldest kept
    });

    it('should not throw on Redis error', async () => {
      // Arrange
      const entry: PairingHistoryEntry = {
        timestamp: Date.now(),
        appSessionId: 'app-session-123',
        runnerId: 'runner-456',
        pairingCode: 'ABC-123-XYZ',
        success: true,
      };

      // Mock Redis to throw an error
      jest.spyOn(redisMock, 'lpush').mockRejectedValueOnce(new Error('Redis error'));

      // Act & Assert - Should not throw
      await expect(service.record(entry)).resolves.not.toThrow();
    });
  });

  describe('getHistory', () => {
    beforeEach(async () => {
      // Set up some test data
      for (let i = 0; i < 50; i++) {
        await service.record({
          timestamp: i,
          appSessionId: `app-${i}`,
          runnerId: `runner-${i}`,
          pairingCode: `CODE-${i}`,
          success: i % 2 === 0, // Alternate success/failure
          errorCode: i % 2 === 0 ? undefined : PairingErrorCode.CODE_NOT_FOUND,
        });
      }
    });

    it('should retrieve history with default limit (100)', async () => {
      // Act
      const history = await service.getHistory();

      // Assert
      expect(history).toHaveLength(50); // We only have 50 entries
      expect(history[0].timestamp).toBe(49); // Most recent first
    });

    it('should retrieve history with custom limit', async () => {
      // Act
      const history = await service.getHistory(10);

      // Assert
      expect(history).toHaveLength(10);
      expect(history[0].timestamp).toBe(49); // Most recent
      expect(history[9].timestamp).toBe(40);
    });

    it('should cap limit at 1000', async () => {
      // Act
      const history = await service.getHistory(5000);

      // Assert
      expect(history).toHaveLength(50); // We only have 50 entries
    });

    it('should handle limit of 1', async () => {
      // Act
      const history = await service.getHistory(1);

      // Assert
      expect(history).toHaveLength(1);
      expect(history[0].timestamp).toBe(49); // Most recent
    });

    it('should return empty array when no history exists', async () => {
      // Arrange - Clear history
      await service.clearHistory();

      // Act
      const history = await service.getHistory();

      // Assert
      expect(history).toEqual([]);
    });

    it('should return empty array on Redis error', async () => {
      // Arrange
      jest.spyOn(redisMock, 'lrange').mockRejectedValueOnce(new Error('Redis error'));

      // Act
      const history = await service.getHistory();

      // Assert
      expect(history).toEqual([]);
    });

    it('should skip invalid JSON entries', async () => {
      // Arrange - Manually add invalid JSON to Redis
      await redisMock.lpush('pairing:history', 'invalid-json');
      await redisMock.lpush('pairing:history', JSON.stringify({
        timestamp: 999,
        appSessionId: 'valid-app',
        runnerId: 'valid-runner',
        pairingCode: 'VALID-CODE',
        success: true,
      }));

      // Act
      const history = await service.getHistory(10);

      // Assert
      // Should only return the valid entry, skipping the invalid one
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].timestamp).toBe(999);
    });
  });

  describe('getHistoryCount', () => {
    it('should return 0 when no history exists', async () => {
      // Act
      const count = await service.getHistoryCount();

      // Assert
      expect(count).toBe(0);
    });

    it('should return correct count after recording events', async () => {
      // Arrange
      for (let i = 0; i < 25; i++) {
        await service.record({
          timestamp: i,
          appSessionId: `app-${i}`,
          runnerId: `runner-${i}`,
          pairingCode: `CODE-${i}`,
          success: true,
        });
      }

      // Act
      const count = await service.getHistoryCount();

      // Assert
      expect(count).toBe(25);
    });

    it('should return 0 on Redis error', async () => {
      // Arrange
      jest.spyOn(redisMock, 'llen').mockRejectedValueOnce(new Error('Redis error'));

      // Act
      const count = await service.getHistoryCount();

      // Assert
      expect(count).toBe(0);
    });
  });

  describe('clearHistory', () => {
    it('should clear all history entries', async () => {
      // Arrange - Add some entries
      for (let i = 0; i < 10; i++) {
        await service.record({
          timestamp: i,
          appSessionId: `app-${i}`,
          runnerId: `runner-${i}`,
          pairingCode: `CODE-${i}`,
          success: true,
        });
      }

      // Verify entries exist
      let count = await service.getHistoryCount();
      expect(count).toBe(10);

      // Act
      await service.clearHistory();

      // Assert
      count = await service.getHistoryCount();
      expect(count).toBe(0);

      const history = await service.getHistory();
      expect(history).toEqual([]);
    });

    it('should not throw on Redis error', async () => {
      // Arrange
      jest.spyOn(redisMock, 'del').mockRejectedValueOnce(new Error('Redis error'));

      // Act & Assert - Should not throw
      await expect(service.clearHistory()).resolves.not.toThrow();
    });
  });

  describe('Requirements validation', () => {
    it('should satisfy Requirement 12.1: Record pairing events with timestamp, app session ID, and runner ID', async () => {
      // Arrange
      const entry: PairingHistoryEntry = {
        timestamp: Date.now(),
        appSessionId: 'app-session-123',
        runnerId: 'runner-456',
        pairingCode: 'ABC-123-XYZ',
        success: true,
      };

      // Act
      await service.record(entry);
      const history = await service.getHistory(1);

      // Assert
      expect(history[0]).toHaveProperty('timestamp');
      expect(history[0]).toHaveProperty('appSessionId');
      expect(history[0]).toHaveProperty('runnerId');
      expect(history[0].timestamp).toBe(entry.timestamp);
      expect(history[0].appSessionId).toBe(entry.appSessionId);
      expect(history[0].runnerId).toBe(entry.runnerId);
    });

    it('should satisfy Requirement 12.2: Record failure reasons and attempted pairing codes', async () => {
      // Arrange
      const entry: PairingHistoryEntry = {
        timestamp: Date.now(),
        appSessionId: 'app-session-789',
        runnerId: null,
        pairingCode: 'XYZ-789-ABC',
        success: false,
        errorCode: PairingErrorCode.RATE_LIMITED,
      };

      // Act
      await service.record(entry);
      const history = await service.getHistory(1);

      // Assert
      expect(history[0]).toHaveProperty('errorCode');
      expect(history[0]).toHaveProperty('pairingCode');
      expect(history[0].errorCode).toBe(PairingErrorCode.RATE_LIMITED);
      expect(history[0].pairingCode).toBe(entry.pairingCode);
      expect(history[0].success).toBe(false);
    });

    it('should satisfy Requirement 12.3: Maintain the most recent 1000 entries', async () => {
      // Arrange - Record 1000 entries
      for (let i = 0; i < 1000; i++) {
        await service.record({
          timestamp: i,
          appSessionId: `app-${i}`,
          runnerId: `runner-${i}`,
          pairingCode: `CODE-${i}`,
          success: true,
        });
      }

      // Act
      const count = await service.getHistoryCount();
      const history = await service.getHistory(1000);

      // Assert
      expect(count).toBe(1000);
      expect(history).toHaveLength(1000);
      expect(history[0].timestamp).toBe(999); // Most recent
      expect(history[999].timestamp).toBe(0); // Oldest
    });

    it('should satisfy Requirement 12.4: Delete oldest records when limit is exceeded', async () => {
      // Arrange - Record 1050 entries
      for (let i = 0; i < 1050; i++) {
        await service.record({
          timestamp: i,
          appSessionId: `app-${i}`,
          runnerId: `runner-${i}`,
          pairingCode: `CODE-${i}`,
          success: true,
        });
      }

      // Act
      const count = await service.getHistoryCount();
      const history = await service.getHistory(1000);

      // Assert
      expect(count).toBe(1000); // Should not exceed 1000
      expect(history).toHaveLength(1000);
      
      // Verify oldest 50 entries (0-49) were deleted
      expect(history[0].timestamp).toBe(1049); // Most recent
      expect(history[999].timestamp).toBe(50); // Oldest kept (entry 0-49 deleted)
      
      // Verify entry 0 is not in history
      const hasEntry0 = history.some(entry => entry.timestamp === 0);
      expect(hasEntry0).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle recording with null runnerId (failed pairing)', async () => {
      // Arrange
      const entry: PairingHistoryEntry = {
        timestamp: Date.now(),
        appSessionId: 'app-session-123',
        runnerId: null,
        pairingCode: 'ABC-123-XYZ',
        success: false,
        errorCode: PairingErrorCode.CODE_NOT_FOUND,
      };

      // Act
      await service.record(entry);
      const history = await service.getHistory(1);

      // Assert
      expect(history[0].runnerId).toBeNull();
      expect(history[0].success).toBe(false);
    });

    it('should handle very large timestamps', async () => {
      // Arrange
      const largeTimestamp = Number.MAX_SAFE_INTEGER;
      const entry: PairingHistoryEntry = {
        timestamp: largeTimestamp,
        appSessionId: 'app-session-123',
        runnerId: 'runner-456',
        pairingCode: 'ABC-123-XYZ',
        success: true,
      };

      // Act
      await service.record(entry);
      const history = await service.getHistory(1);

      // Assert
      expect(history[0].timestamp).toBe(largeTimestamp);
    });

    it('should handle special characters in session IDs and pairing codes', async () => {
      // Arrange
      const entry: PairingHistoryEntry = {
        timestamp: Date.now(),
        appSessionId: 'app-session-!@#$%^&*()',
        runnerId: 'runner-<>?:"{}|',
        pairingCode: 'ABC-123-XYZ',
        success: true,
      };

      // Act
      await service.record(entry);
      const history = await service.getHistory(1);

      // Assert
      expect(history[0].appSessionId).toBe(entry.appSessionId);
      expect(history[0].runnerId).toBe(entry.runnerId);
    });
  });
});

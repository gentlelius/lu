import { Test, TestingModule } from '@nestjs/testing';
import { PairingCodeService } from '../pairing-code.service';
import { RedisService } from '../../redis/redis.service';
import { PairingErrorCode } from '../../types/pairing.types';
import RedisMock from 'ioredis-mock';

describe('PairingCodeService', () => {
  let service: PairingCodeService;
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
        PairingCodeService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<PairingCodeService>(PairingCodeService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(async () => {
    // Clean up Redis mock
    await redisMock.flushall();
  });

  describe('registerCode', () => {
    it('should successfully register a new pairing code', async () => {
      const code = 'ABC-123-XYZ';
      const runnerId = 'runner-uuid-123';

      await service.registerCode(code, runnerId);

      // Verify the code was stored in Redis
      const storedData = await redisMock.get(`pairing:code:${code}`);
      expect(storedData).toBeDefined();

      const entry = JSON.parse(storedData!);
      expect(entry.code).toBe(code);
      expect(entry.runnerId).toBe(runnerId);
      expect(entry.isActive).toBe(true);
      expect(entry.usedCount).toBe(0);
      expect(entry.createdAt).toBeDefined();
      expect(entry.expiresAt).toBeDefined();

      // Verify the reverse index was created
      const reverseIndex = await redisMock.get(`pairing:runner:${runnerId}`);
      expect(reverseIndex).toBe(code);

      // Verify TTL was set (24 hours = 86400 seconds)
      const ttl = await redisMock.ttl(`pairing:code:${code}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(86400);
    });

    it('should throw DUPLICATE_CODE error if code already exists', async () => {
      const code = 'ABC-123-XYZ';
      const runnerId1 = 'runner-uuid-123';
      const runnerId2 = 'runner-uuid-456';

      // Register the code first time
      await service.registerCode(code, runnerId1);

      // Try to register the same code again
      await expect(service.registerCode(code, runnerId2)).rejects.toThrow(
        PairingErrorCode.DUPLICATE_CODE,
      );

      // Verify the original entry is still intact
      const storedData = await redisMock.get(`pairing:code:${code}`);
      const entry = JSON.parse(storedData!);
      expect(entry.runnerId).toBe(runnerId1);
    });

    it('should handle multiple different codes for different runners', async () => {
      const code1 = 'ABC-123-XYZ';
      const code2 = 'DEF-456-UVW';
      const runnerId1 = 'runner-uuid-123';
      const runnerId2 = 'runner-uuid-456';

      await service.registerCode(code1, runnerId1);
      await service.registerCode(code2, runnerId2);

      // Verify both codes are stored
      const data1 = await redisMock.get(`pairing:code:${code1}`);
      const data2 = await redisMock.get(`pairing:code:${code2}`);

      expect(data1).toBeDefined();
      expect(data2).toBeDefined();

      const entry1 = JSON.parse(data1!);
      const entry2 = JSON.parse(data2!);

      expect(entry1.runnerId).toBe(runnerId1);
      expect(entry2.runnerId).toBe(runnerId2);
    });
  });

  describe('validateCode', () => {
    it('should return valid result for an existing active code', async () => {
      const code = 'ABC-123-XYZ';
      const runnerId = 'runner-uuid-123';

      await service.registerCode(code, runnerId);

      const result = await service.validateCode(code);

      expect(result.valid).toBe(true);
      expect(result.runnerId).toBe(runnerId);
      expect(result.error).toBeUndefined();
    });

    it('should return CODE_NOT_FOUND for non-existent code', async () => {
      const result = await service.validateCode('NONEXISTENT');

      expect(result.valid).toBe(false);
      expect(result.error).toBe(PairingErrorCode.CODE_NOT_FOUND);
      expect(result.runnerId).toBeUndefined();
    });

    it('should return CODE_EXPIRED for inactive code', async () => {
      const code = 'ABC-123-XYZ';
      const runnerId = 'runner-uuid-123';

      // Manually create an inactive code entry
      const entry = {
        code,
        runnerId,
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        usedCount: 0,
        isActive: false,
      };

      await redisMock.set(`pairing:code:${code}`, JSON.stringify(entry));

      const result = await service.validateCode(code);

      expect(result.valid).toBe(false);
      expect(result.error).toBe(PairingErrorCode.CODE_EXPIRED);
    });

    it('should return CODE_EXPIRED and invalidate expired code', async () => {
      const code = 'ABC-123-XYZ';
      const runnerId = 'runner-uuid-123';

      // Create an expired code entry
      const entry = {
        code,
        runnerId,
        createdAt: Date.now() - 86400000 - 1000, // Created 24 hours + 1 second ago
        expiresAt: Date.now() - 1000, // Expired 1 second ago
        usedCount: 0,
        isActive: true,
      };

      await redisMock.set(`pairing:code:${code}`, JSON.stringify(entry));
      await redisMock.set(`pairing:runner:${runnerId}`, code);

      const result = await service.validateCode(code);

      expect(result.valid).toBe(false);
      expect(result.error).toBe(PairingErrorCode.CODE_EXPIRED);

      // Verify the code was invalidated
      const storedData = await redisMock.get(`pairing:code:${code}`);
      expect(storedData).toBeNull();

      // Verify the reverse index was removed
      const reverseIndex = await redisMock.get(`pairing:runner:${runnerId}`);
      expect(reverseIndex).toBeNull();
    });

    it('should NOT expire used codes even after 24 hours (Requirement 5.3)', async () => {
      const code = 'ABC-123-XYZ';
      const runnerId = 'runner-uuid-123';

      // Create an expired but used code entry
      const entry = {
        code,
        runnerId,
        createdAt: Date.now() - 86400000 - 1000, // Created 24 hours + 1 second ago
        expiresAt: Date.now() - 1000, // Expired 1 second ago
        usedCount: 2, // Code has been used
        isActive: true,
      };

      await redisMock.set(`pairing:code:${code}`, JSON.stringify(entry));
      await redisMock.set(`pairing:runner:${runnerId}`, code);

      const result = await service.validateCode(code);

      // Used codes should remain valid despite being past expiration time
      expect(result.valid).toBe(true);
      expect(result.runnerId).toBe(runnerId);
      expect(result.error).toBeUndefined();

      // Verify the code was NOT invalidated
      const storedData = await redisMock.get(`pairing:code:${code}`);
      expect(storedData).not.toBeNull();
    });

    it('should validate multiple codes independently', async () => {
      const code1 = 'ABC-123-XYZ';
      const code2 = 'DEF-456-UVW';
      const runnerId1 = 'runner-uuid-123';
      const runnerId2 = 'runner-uuid-456';

      await service.registerCode(code1, runnerId1);
      await service.registerCode(code2, runnerId2);

      const result1 = await service.validateCode(code1);
      const result2 = await service.validateCode(code2);

      expect(result1.valid).toBe(true);
      expect(result1.runnerId).toBe(runnerId1);

      expect(result2.valid).toBe(true);
      expect(result2.runnerId).toBe(runnerId2);
    });
  });

  describe('invalidateCode', () => {
    it('should remove code and reverse index', async () => {
      const code = 'ABC-123-XYZ';
      const runnerId = 'runner-uuid-123';

      await service.registerCode(code, runnerId);

      // Verify code exists
      let storedData = await redisMock.get(`pairing:code:${code}`);
      expect(storedData).toBeDefined();

      await service.invalidateCode(code);

      // Verify code was removed
      storedData = await redisMock.get(`pairing:code:${code}`);
      expect(storedData).toBeNull();

      // Verify reverse index was removed
      const reverseIndex = await redisMock.get(`pairing:runner:${runnerId}`);
      expect(reverseIndex).toBeNull();
    });

    it('should handle invalidating non-existent code gracefully', async () => {
      // Should not throw an error
      await expect(service.invalidateCode('NONEXISTENT')).resolves.not.toThrow();
    });

    it('should allow re-registration after invalidation', async () => {
      const code = 'ABC-123-XYZ';
      const runnerId1 = 'runner-uuid-123';
      const runnerId2 = 'runner-uuid-456';

      // Register, invalidate, then register again with different runner
      await service.registerCode(code, runnerId1);
      await service.invalidateCode(code);
      await service.registerCode(code, runnerId2);

      // Verify the new registration
      const result = await service.validateCode(code);
      expect(result.valid).toBe(true);
      expect(result.runnerId).toBe(runnerId2);
    });
  });

  describe('findCodeByRunnerId', () => {
    it('should return the code for a registered runner', async () => {
      const code = 'ABC-123-XYZ';
      const runnerId = 'runner-uuid-123';

      await service.registerCode(code, runnerId);

      const foundCode = await service.findCodeByRunnerId(runnerId);
      expect(foundCode).toBe(code);
    });

    it('should return null for non-existent runner', async () => {
      const foundCode = await service.findCodeByRunnerId('nonexistent-runner');
      expect(foundCode).toBeNull();
    });

    it('should return null after code invalidation', async () => {
      const code = 'ABC-123-XYZ';
      const runnerId = 'runner-uuid-123';

      await service.registerCode(code, runnerId);
      await service.invalidateCode(code);

      const foundCode = await service.findCodeByRunnerId(runnerId);
      expect(foundCode).toBeNull();
    });

    it('should handle multiple runners with different codes', async () => {
      const code1 = 'ABC-123-XYZ';
      const code2 = 'DEF-456-UVW';
      const runnerId1 = 'runner-uuid-123';
      const runnerId2 = 'runner-uuid-456';

      await service.registerCode(code1, runnerId1);
      await service.registerCode(code2, runnerId2);

      const foundCode1 = await service.findCodeByRunnerId(runnerId1);
      const foundCode2 = await service.findCodeByRunnerId(runnerId2);

      expect(foundCode1).toBe(code1);
      expect(foundCode2).toBe(code2);
    });
  });

  describe('registerCodeWithRetry', () => {
    it('should successfully register on first attempt', async () => {
      const code = 'ABC-123-XYZ';
      const runnerId = 'runner-uuid-123';
      const codeGenerator = jest.fn().mockReturnValue(code);

      const registeredCode = await service.registerCodeWithRetry(
        codeGenerator,
        runnerId,
      );

      expect(registeredCode).toBe(code);
      expect(codeGenerator).toHaveBeenCalledTimes(1);

      // Verify the code was registered
      const result = await service.validateCode(code);
      expect(result.valid).toBe(true);
      expect(result.runnerId).toBe(runnerId);
    });

    it('should retry on collision and succeed on second attempt', async () => {
      const code1 = 'ABC-123-XYZ';
      const code2 = 'DEF-456-UVW';
      const runnerId1 = 'runner-uuid-123';
      const runnerId2 = 'runner-uuid-456';

      // Pre-register the first code
      await service.registerCode(code1, runnerId1);

      // Generator returns code1 first (collision), then code2 (success)
      const codeGenerator = jest
        .fn()
        .mockReturnValueOnce(code1)
        .mockReturnValueOnce(code2);

      const registeredCode = await service.registerCodeWithRetry(
        codeGenerator,
        runnerId2,
      );

      expect(registeredCode).toBe(code2);
      expect(codeGenerator).toHaveBeenCalledTimes(2);

      // Verify the second code was registered
      const result = await service.validateCode(code2);
      expect(result.valid).toBe(true);
      expect(result.runnerId).toBe(runnerId2);
    });

    it('should retry up to 3 times and throw error if all fail', async () => {
      const code = 'ABC-123-XYZ';
      const runnerId1 = 'runner-uuid-123';
      const runnerId2 = 'runner-uuid-456';

      // Pre-register the code
      await service.registerCode(code, runnerId1);

      // Generator always returns the same code (collision every time)
      const codeGenerator = jest.fn().mockReturnValue(code);

      await expect(
        service.registerCodeWithRetry(codeGenerator, runnerId2),
      ).rejects.toThrow('Failed to generate unique pairing code after 3 attempts');

      expect(codeGenerator).toHaveBeenCalledTimes(3);
    });

    it('should succeed on third attempt after two collisions', async () => {
      const code1 = 'ABC-123-XYZ';
      const code2 = 'DEF-456-UVW';
      const code3 = 'GHI-789-RST';
      const runnerId1 = 'runner-uuid-123';
      const runnerId2 = 'runner-uuid-456';
      const runnerId3 = 'runner-uuid-789';

      // Pre-register two codes
      await service.registerCode(code1, runnerId1);
      await service.registerCode(code2, runnerId2);

      // Generator returns code1, code2 (collisions), then code3 (success)
      const codeGenerator = jest
        .fn()
        .mockReturnValueOnce(code1)
        .mockReturnValueOnce(code2)
        .mockReturnValueOnce(code3);

      const registeredCode = await service.registerCodeWithRetry(
        codeGenerator,
        runnerId3,
      );

      expect(registeredCode).toBe(code3);
      expect(codeGenerator).toHaveBeenCalledTimes(3);

      // Verify the third code was registered
      const result = await service.validateCode(code3);
      expect(result.valid).toBe(true);
      expect(result.runnerId).toBe(runnerId3);
    });
  });

  describe('incrementUsageCount', () => {
    it('should increment usage count for existing code', async () => {
      const code = 'ABC-123-XYZ';
      const runnerId = 'runner-uuid-123';

      await service.registerCode(code, runnerId);

      // Increment usage count
      await service.incrementUsageCount(code);

      // Verify the count was incremented
      const storedData = await redisMock.get(`pairing:code:${code}`);
      const entry = JSON.parse(storedData!);
      expect(entry.usedCount).toBe(1);

      // Increment again
      await service.incrementUsageCount(code);

      const updatedData = await redisMock.get(`pairing:code:${code}`);
      const updatedEntry = JSON.parse(updatedData!);
      expect(updatedEntry.usedCount).toBe(2);
    });

    it('should handle incrementing non-existent code gracefully', async () => {
      // Should not throw an error
      await expect(
        service.incrementUsageCount('NONEXISTENT'),
      ).resolves.not.toThrow();
    });

    it('should remove TTL when code is used for the first time (Requirement 5.3)', async () => {
      const code = 'ABC-123-XYZ';
      const runnerId = 'runner-uuid-123';

      await service.registerCode(code, runnerId);

      // Verify TTL is set initially
      const initialTtl = await redisMock.ttl(`pairing:code:${code}`);
      expect(initialTtl).toBeGreaterThan(0);

      // Increment usage count for the first time
      await service.incrementUsageCount(code);

      // Verify TTL is removed (persist returns -1 for keys with no TTL)
      const afterTtl = await redisMock.ttl(`pairing:code:${code}`);
      expect(afterTtl).toBe(-1);

      // Verify the code entry still exists
      const storedData = await redisMock.get(`pairing:code:${code}`);
      expect(storedData).not.toBeNull();

      const entry = JSON.parse(storedData!);
      expect(entry.usedCount).toBe(1);
    });

    it('should keep code valid indefinitely after first use', async () => {
      const code = 'ABC-123-XYZ';
      const runnerId = 'runner-uuid-123';

      await service.registerCode(code, runnerId);

      // Use the code
      await service.incrementUsageCount(code);

      // Verify no TTL
      const ttl = await redisMock.ttl(`pairing:code:${code}`);
      expect(ttl).toBe(-1);

      // Increment again
      await service.incrementUsageCount(code);

      // TTL should still be -1 (no expiration)
      const ttlAfter = await redisMock.ttl(`pairing:code:${code}`);
      expect(ttlAfter).toBe(-1);

      // Verify usage count
      const storedData = await redisMock.get(`pairing:code:${code}`);
      const entry = JSON.parse(storedData!);
      expect(entry.usedCount).toBe(2);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle concurrent registrations of different codes', async () => {
      const codes = ['ABC-123-XYZ', 'DEF-456-UVW', 'GHI-789-RST'];
      const runnerIds = ['runner-1', 'runner-2', 'runner-3'];

      // Register all codes concurrently
      await Promise.all(
        codes.map((code, index) => service.registerCode(code, runnerIds[index])),
      );

      // Verify all codes were registered
      for (let i = 0; i < codes.length; i++) {
        const result = await service.validateCode(codes[i]);
        expect(result.valid).toBe(true);
        expect(result.runnerId).toBe(runnerIds[i]);
      }
    });

    it('should handle runner with multiple sequential code registrations', async () => {
      const runnerId = 'runner-uuid-123';
      const code1 = 'ABC-123-XYZ';
      const code2 = 'DEF-456-UVW';

      // Register first code
      await service.registerCode(code1, runnerId);

      // Invalidate and register new code for same runner
      await service.invalidateCode(code1);
      await service.registerCode(code2, runnerId);

      // Verify only the new code is valid
      const result1 = await service.validateCode(code1);
      expect(result1.valid).toBe(false);

      const result2 = await service.validateCode(code2);
      expect(result2.valid).toBe(true);
      expect(result2.runnerId).toBe(runnerId);

      // Verify reverse index points to new code
      const foundCode = await service.findCodeByRunnerId(runnerId);
      expect(foundCode).toBe(code2);
    });
  });
});

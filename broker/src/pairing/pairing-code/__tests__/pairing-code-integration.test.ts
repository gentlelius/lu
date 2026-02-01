import { Test, TestingModule } from '@nestjs/testing';
import { PairingCodeService } from '../pairing-code.service';
import { PairingCodeGenerator } from '../../code-generator/pairing-code-generator';
import { RedisService } from '../../redis/redis.service';
import RedisMock from 'ioredis-mock';

/**
 * Integration tests for PairingCodeService with PairingCodeGenerator
 * 
 * These tests verify that the service works correctly with the code generator
 * to handle the complete pairing code lifecycle including collision handling.
 */
describe('PairingCodeService Integration', () => {
  let service: PairingCodeService;
  let generator: PairingCodeGenerator;
  let redisMock: InstanceType<typeof RedisMock>;

  beforeEach(async () => {
    redisMock = new RedisMock();

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
    generator = new PairingCodeGenerator();
  });

  afterEach(async () => {
    await redisMock.flushall();
  });

  describe('Complete pairing code lifecycle', () => {
    it('should generate, register, validate, and invalidate a code', async () => {
      const runnerId = 'runner-uuid-123';

      // Generate a code
      const code = generator.generate();
      expect(generator.validate(code)).toBe(true);

      // Register the code
      await service.registerCode(code, runnerId);

      // Validate the code
      const validationResult = await service.validateCode(code);
      expect(validationResult.valid).toBe(true);
      expect(validationResult.runnerId).toBe(runnerId);

      // Find code by runner ID
      const foundCode = await service.findCodeByRunnerId(runnerId);
      expect(foundCode).toBe(code);

      // Invalidate the code
      await service.invalidateCode(code);

      // Verify code is no longer valid
      const invalidResult = await service.validateCode(code);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toBe('CODE_NOT_FOUND');

      // Verify reverse index is removed
      const notFoundCode = await service.findCodeByRunnerId(runnerId);
      expect(notFoundCode).toBeNull();
    });

    it('should handle multiple runners with generated codes', async () => {
      const runnerIds = ['runner-1', 'runner-2', 'runner-3'];
      const codes: string[] = [];

      // Generate and register codes for multiple runners
      for (const runnerId of runnerIds) {
        const code = generator.generate();
        expect(generator.validate(code)).toBe(true);

        await service.registerCode(code, runnerId);
        codes.push(code);
      }

      // Verify all codes are valid and map to correct runners
      for (let i = 0; i < runnerIds.length; i++) {
        const result = await service.validateCode(codes[i]);
        expect(result.valid).toBe(true);
        expect(result.runnerId).toBe(runnerIds[i]);

        const foundCode = await service.findCodeByRunnerId(runnerIds[i]);
        expect(foundCode).toBe(codes[i]);
      }
    });

    it('should successfully use registerCodeWithRetry with generator', async () => {
      const runnerId = 'runner-uuid-123';

      // Use the retry mechanism with the generator
      const code = await service.registerCodeWithRetry(
        () => generator.generate(),
        runnerId,
      );

      // Verify the code is valid
      expect(generator.validate(code)).toBe(true);

      // Verify the code was registered
      const result = await service.validateCode(code);
      expect(result.valid).toBe(true);
      expect(result.runnerId).toBe(runnerId);
    });

    it('should handle runner reconnection scenario', async () => {
      const runnerId = 'runner-uuid-123';

      // Initial connection: generate and register code
      const code1 = generator.generate();
      await service.registerCode(code1, runnerId);

      // Simulate runner disconnect: invalidate code
      await service.invalidateCode(code1);

      // Verify old code is invalid
      const oldResult = await service.validateCode(code1);
      expect(oldResult.valid).toBe(false);

      // Reconnection: generate and register new code
      const code2 = generator.generate();
      await service.registerCode(code2, runnerId);

      // Verify new code is valid
      const newResult = await service.validateCode(code2);
      expect(newResult.valid).toBe(true);
      expect(newResult.runnerId).toBe(runnerId);

      // Verify reverse index points to new code
      const foundCode = await service.findCodeByRunnerId(runnerId);
      expect(foundCode).toBe(code2);
    });

    it('should track usage count through pairing lifecycle', async () => {
      const runnerId = 'runner-uuid-123';
      const code = generator.generate();

      await service.registerCode(code, runnerId);

      // Simulate multiple successful pairings
      await service.incrementUsageCount(code);
      await service.incrementUsageCount(code);
      await service.incrementUsageCount(code);

      // Verify usage count
      const storedData = await redisMock.get(`pairing:code:${code}`);
      const entry = JSON.parse(storedData!);
      expect(entry.usedCount).toBe(3);
    });
  });

  describe('Collision handling', () => {
    it('should handle simulated collision with retry', async () => {
      const runnerId1 = 'runner-uuid-123';
      const runnerId2 = 'runner-uuid-456';

      // Pre-register a code
      const existingCode = generator.generate();
      await service.registerCode(existingCode, runnerId1);

      // Create a generator that returns the existing code first, then a new one
      let callCount = 0;
      const mockGenerator = () => {
        callCount++;
        if (callCount === 1) {
          return existingCode; // Collision
        }
        return generator.generate(); // New code
      };

      // Should succeed on second attempt
      const newCode = await service.registerCodeWithRetry(mockGenerator, runnerId2);

      expect(newCode).not.toBe(existingCode);
      expect(generator.validate(newCode)).toBe(true);

      // Verify both codes are valid
      const result1 = await service.validateCode(existingCode);
      expect(result1.valid).toBe(true);
      expect(result1.runnerId).toBe(runnerId1);

      const result2 = await service.validateCode(newCode);
      expect(result2.valid).toBe(true);
      expect(result2.runnerId).toBe(runnerId2);
    });
  });

  describe('Format validation integration', () => {
    it('should only accept codes with valid format', async () => {
      const runnerId = 'runner-uuid-123';

      // Generate a valid code
      const validCode = generator.generate();
      expect(generator.validate(validCode)).toBe(true);

      // Register should succeed
      await expect(service.registerCode(validCode, runnerId)).resolves.not.toThrow();

      // Invalid formats (these would be rejected by the gateway before reaching the service)
      const invalidCodes = [
        'abc-123-xyz', // lowercase
        'ABC123XYZ',   // no separators
        'AB-123-XYZ',  // wrong length
        'ABC-12-XYZ',  // wrong group size
        'ABC-123-XY',  // too short
      ];

      for (const invalidCode of invalidCodes) {
        expect(generator.validate(invalidCode)).toBe(false);
      }
    });
  });

  describe('Expiration handling', () => {
    it('should detect and invalidate expired codes', async () => {
      const runnerId = 'runner-uuid-123';
      const code = generator.generate();

      // Create an expired code entry manually
      const expiredEntry = {
        code,
        runnerId,
        createdAt: Date.now() - 86400000 - 1000, // 24 hours + 1 second ago
        expiresAt: Date.now() - 1000, // Expired 1 second ago
        usedCount: 0,
        isActive: true,
      };

      await redisMock.set(`pairing:code:${code}`, JSON.stringify(expiredEntry));
      await redisMock.set(`pairing:runner:${runnerId}`, code);

      // Validate should detect expiration and auto-invalidate
      const result = await service.validateCode(code);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('CODE_EXPIRED');

      // Verify code was removed
      const storedData = await redisMock.get(`pairing:code:${code}`);
      expect(storedData).toBeNull();
    });
  });

  describe('Concurrent operations', () => {
    it('should handle concurrent code registrations', async () => {
      const runnerIds = Array.from({ length: 10 }, (_, i) => `runner-${i}`);

      // Register codes concurrently
      const registrations = runnerIds.map((runnerId) =>
        service.registerCodeWithRetry(() => generator.generate(), runnerId),
      );

      const codes = await Promise.all(registrations);

      // Verify all codes are unique
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);

      // Verify all codes are valid
      for (let i = 0; i < codes.length; i++) {
        const result = await service.validateCode(codes[i]);
        expect(result.valid).toBe(true);
        expect(result.runnerId).toBe(runnerIds[i]);
      }
    });
  });
});

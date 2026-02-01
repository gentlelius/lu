import { Test, TestingModule } from '@nestjs/testing';
import { RateLimitService } from '../rate-limit.service';
import { RedisService } from '../../redis/redis.service';
import RedisMock from 'ioredis-mock';

describe('RateLimitService', () => {
  let service: RateLimitService;
  let redisService: RedisService;
  let redisMock: InstanceType<typeof RedisMock>;

  beforeEach(async () => {
    // Create a mock Redis client
    redisMock = new RedisMock();

    // Create a mock RedisService
    const mockRedisService = {
      getClient: jest.fn().mockReturnValue(redisMock),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<RateLimitService>(RateLimitService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(async () => {
    // Clean up Redis mock
    await redisMock.flushall();
  });

  describe('isBanned', () => {
    it('should return false when session is not banned', async () => {
      const result = await service.isBanned('test-session');
      expect(result).toBe(false);
    });

    it('should return true when session is banned', async () => {
      const appSessionId = 'test-session';
      const bannedUntil = Date.now() + 300000; // 5 minutes from now

      await redisMock.set(`ratelimit:ban:${appSessionId}`, bannedUntil.toString());

      const result = await service.isBanned(appSessionId);
      expect(result).toBe(true);
    });

    it('should return false and clean up when ban has expired', async () => {
      const appSessionId = 'test-session';
      const bannedUntil = Date.now() - 1000; // 1 second ago (expired)

      await redisMock.set(`ratelimit:ban:${appSessionId}`, bannedUntil.toString());

      const result = await service.isBanned(appSessionId);
      expect(result).toBe(false);

      // Verify the ban record was deleted
      const banRecord = await redisMock.get(`ratelimit:ban:${appSessionId}`);
      expect(banRecord).toBeNull();
    });
  });

  describe('recordFailedAttempt', () => {
    it('should record a failed attempt', async () => {
      const appSessionId = 'test-session';

      await service.recordFailedAttempt(appSessionId);

      // Verify the attempt was added to the sorted set
      const count = await redisMock.zcard(`ratelimit:attempts:${appSessionId}`);
      expect(count).toBe(1);
    });

    it('should record multiple failed attempts', async () => {
      const appSessionId = 'test-session';

      await service.recordFailedAttempt(appSessionId);
      await service.recordFailedAttempt(appSessionId);
      await service.recordFailedAttempt(appSessionId);

      const count = await redisMock.zcard(`ratelimit:attempts:${appSessionId}`);
      expect(count).toBe(3);
    });

    it('should ban session after 5 failed attempts', async () => {
      const appSessionId = 'test-session';

      // Record 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await service.recordFailedAttempt(appSessionId);
      }

      // Verify the session is banned
      const banned = await service.isBanned(appSessionId);
      expect(banned).toBe(true);
    });

    it('should remove old attempts outside the window', async () => {
      const appSessionId = 'test-session';
      const key = `ratelimit:attempts:${appSessionId}`;

      // Add an old attempt (2 minutes ago, outside the 1-minute window)
      const oldTimestamp = Date.now() - 120000;
      await redisMock.zadd(key, oldTimestamp, `${oldTimestamp}`);

      // Record a new attempt
      await service.recordFailedAttempt(appSessionId);

      // Verify only the new attempt remains
      const count = await redisMock.zcard(key);
      expect(count).toBe(1);

      // Verify the old attempt was removed
      const members = await redisMock.zrange(key, 0, -1);
      expect(members).not.toContain(`${oldTimestamp}`);
    });

    it('should set TTL on attempts key', async () => {
      const appSessionId = 'test-session';
      const key = `ratelimit:attempts:${appSessionId}`;

      await service.recordFailedAttempt(appSessionId);

      // Verify TTL is set (should be 60 seconds)
      const ttl = await redisMock.ttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('should set TTL on ban key when banning', async () => {
      const appSessionId = 'test-session';
      const banKey = `ratelimit:ban:${appSessionId}`;

      // Record 5 failed attempts to trigger ban
      for (let i = 0; i < 5; i++) {
        await service.recordFailedAttempt(appSessionId);
      }

      // Verify TTL is set on ban key (should be 300 seconds)
      const ttl = await redisMock.ttl(banKey);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(300);
    });
  });

  describe('reset', () => {
    it('should reset the attempts counter', async () => {
      const appSessionId = 'test-session';

      // Record some failed attempts
      await service.recordFailedAttempt(appSessionId);
      await service.recordFailedAttempt(appSessionId);
      await service.recordFailedAttempt(appSessionId);

      // Verify attempts were recorded
      let count = await redisMock.zcard(`ratelimit:attempts:${appSessionId}`);
      expect(count).toBe(3);

      // Reset the counter
      await service.reset(appSessionId);

      // Verify the counter was reset
      count = await redisMock.zcard(`ratelimit:attempts:${appSessionId}`);
      expect(count).toBe(0);
    });

    it('should be idempotent (safe to call multiple times)', async () => {
      const appSessionId = 'test-session';

      // Reset multiple times (should not throw errors)
      await service.reset(appSessionId);
      await service.reset(appSessionId);
      await service.reset(appSessionId);

      // Verify no errors occurred
      const count = await redisMock.zcard(`ratelimit:attempts:${appSessionId}`);
      expect(count).toBe(0);
    });

    it('should not remove an active ban', async () => {
      const appSessionId = 'test-session';

      // Record 5 failed attempts to trigger ban
      for (let i = 0; i < 5; i++) {
        await service.recordFailedAttempt(appSessionId);
      }

      // Verify the session is banned
      let banned = await service.isBanned(appSessionId);
      expect(banned).toBe(true);

      // Reset the counter
      await service.reset(appSessionId);

      // Verify the ban is still active
      banned = await service.isBanned(appSessionId);
      expect(banned).toBe(true);
    });
  });

  describe('getRemainingBanTime', () => {
    it('should return 0 when session is not banned', async () => {
      const remaining = await service.getRemainingBanTime('test-session');
      expect(remaining).toBe(0);
    });

    it('should return remaining ban time in seconds', async () => {
      const appSessionId = 'test-session';
      const bannedUntil = Date.now() + 120000; // 2 minutes from now

      await redisMock.set(`ratelimit:ban:${appSessionId}`, bannedUntil.toString());

      const remaining = await service.getRemainingBanTime(appSessionId);
      
      // Should be approximately 120 seconds (allow for small timing differences)
      expect(remaining).toBeGreaterThan(115);
      expect(remaining).toBeLessThanOrEqual(120);
    });

    it('should return 0 when ban has expired', async () => {
      const appSessionId = 'test-session';
      const bannedUntil = Date.now() - 1000; // 1 second ago (expired)

      await redisMock.set(`ratelimit:ban:${appSessionId}`, bannedUntil.toString());

      const remaining = await service.getRemainingBanTime(appSessionId);
      expect(remaining).toBe(0);
    });

    it('should round up to the nearest second', async () => {
      const appSessionId = 'test-session';
      const bannedUntil = Date.now() + 1500; // 1.5 seconds from now

      await redisMock.set(`ratelimit:ban:${appSessionId}`, bannedUntil.toString());

      const remaining = await service.getRemainingBanTime(appSessionId);
      
      // Should round up to 2 seconds
      expect(remaining).toBe(2);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete rate limiting flow', async () => {
      const appSessionId = 'test-session';

      // 1. Session starts with no ban
      expect(await service.isBanned(appSessionId)).toBe(false);

      // 2. Record 4 failed attempts (below threshold)
      for (let i = 0; i < 4; i++) {
        await service.recordFailedAttempt(appSessionId);
      }
      expect(await service.isBanned(appSessionId)).toBe(false);

      // 3. 5th attempt triggers ban
      await service.recordFailedAttempt(appSessionId);
      expect(await service.isBanned(appSessionId)).toBe(true);

      // 4. Get remaining ban time
      const remaining = await service.getRemainingBanTime(appSessionId);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(300);

      // 5. Reset counter (ban still active)
      await service.reset(appSessionId);
      expect(await service.isBanned(appSessionId)).toBe(true);
    });

    it('should allow attempts after successful pairing', async () => {
      const appSessionId = 'test-session';

      // Record 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await service.recordFailedAttempt(appSessionId);
      }

      // Successful pairing - reset counter
      await service.reset(appSessionId);

      // Verify counter was reset
      const count = await redisMock.zcard(`ratelimit:attempts:${appSessionId}`);
      expect(count).toBe(0);

      // Can now make 5 more attempts before ban
      for (let i = 0; i < 4; i++) {
        await service.recordFailedAttempt(appSessionId);
      }
      expect(await service.isBanned(appSessionId)).toBe(false);
    });

    it('should handle sliding window correctly', async () => {
      const appSessionId = 'test-session';
      const key = `ratelimit:attempts:${appSessionId}`;

      // Add 4 attempts from 2 minutes ago (outside window)
      const oldTimestamp = Date.now() - 120000;
      for (let i = 0; i < 4; i++) {
        await redisMock.zadd(key, oldTimestamp + i, `${oldTimestamp + i}`);
      }

      // Add 1 current attempt
      await service.recordFailedAttempt(appSessionId);

      // Should only count the 1 current attempt (old ones removed)
      const count = await redisMock.zcard(key);
      expect(count).toBe(1);

      // Should not be banned
      expect(await service.isBanned(appSessionId)).toBe(false);
    });
  });
});

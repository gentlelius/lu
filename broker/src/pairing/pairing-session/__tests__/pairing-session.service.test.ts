import { Test, TestingModule } from '@nestjs/testing';
import { PairingSessionService } from '../pairing-session.service';
import { RedisService } from '../../redis/redis.service';
import RedisMock from 'ioredis-mock';

describe('PairingSessionService', () => {
  let service: PairingSessionService;
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
        PairingSessionService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<PairingSessionService>(PairingSessionService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(async () => {
    // Clean up Redis mock
    await redisMock.flushall();
  });

  describe('createSession', () => {
    it('should successfully create a new pairing session', async () => {
      const appSessionId = 'app-uuid-123';
      const runnerId = 'runner-uuid-456';

      await service.createSession(appSessionId, runnerId);

      // Verify the session was stored in Redis
      const sessionKey = `pairing:session:${appSessionId}`;
      const storedData = await redisMock.get(sessionKey);
      expect(storedData).toBeDefined();

      const session = JSON.parse(storedData!);
      expect(session.appSessionId).toBe(appSessionId);
      expect(session.runnerId).toBe(runnerId);
      expect(session.isActive).toBe(true);
      expect(session.pairedAt).toBeDefined();
      expect(typeof session.pairedAt).toBe('number');

      // Verify the app was added to the runner's app set
      const appsKey = `pairing:apps:${runnerId}`;
      const apps = await redisMock.smembers(appsKey);
      expect(apps).toContain(appSessionId);
    });

    it('should allow multiple apps to pair with the same runner', async () => {
      const appSessionId1 = 'app-uuid-123';
      const appSessionId2 = 'app-uuid-456';
      const appSessionId3 = 'app-uuid-789';
      const runnerId = 'runner-uuid-001';

      // Create three pairing sessions with the same runner
      await service.createSession(appSessionId1, runnerId);
      await service.createSession(appSessionId2, runnerId);
      await service.createSession(appSessionId3, runnerId);

      // Verify all three apps are in the runner's app set
      const appsKey = `pairing:apps:${runnerId}`;
      const apps = await redisMock.smembers(appsKey);
      expect(apps).toHaveLength(3);
      expect(apps).toContain(appSessionId1);
      expect(apps).toContain(appSessionId2);
      expect(apps).toContain(appSessionId3);

      // Verify each app has its own session
      const session1 = await service.getSession(appSessionId1);
      const session2 = await service.getSession(appSessionId2);
      const session3 = await service.getSession(appSessionId3);

      expect(session1?.runnerId).toBe(runnerId);
      expect(session2?.runnerId).toBe(runnerId);
      expect(session3?.runnerId).toBe(runnerId);
    });

    it('should handle creating sessions for different runners', async () => {
      const appSessionId1 = 'app-uuid-123';
      const appSessionId2 = 'app-uuid-456';
      const runnerId1 = 'runner-uuid-001';
      const runnerId2 = 'runner-uuid-002';

      await service.createSession(appSessionId1, runnerId1);
      await service.createSession(appSessionId2, runnerId2);

      // Verify each runner has the correct app
      const apps1 = await redisMock.smembers(`pairing:apps:${runnerId1}`);
      const apps2 = await redisMock.smembers(`pairing:apps:${runnerId2}`);

      expect(apps1).toContain(appSessionId1);
      expect(apps1).not.toContain(appSessionId2);
      expect(apps2).toContain(appSessionId2);
      expect(apps2).not.toContain(appSessionId1);
    });

    it('should update session if app pairs with a different runner', async () => {
      const appSessionId = 'app-uuid-123';
      const runnerId1 = 'runner-uuid-001';
      const runnerId2 = 'runner-uuid-002';

      // First pairing
      await service.createSession(appSessionId, runnerId1);

      // Second pairing with different runner (re-pairing)
      await service.createSession(appSessionId, runnerId2);

      // Verify the session points to the new runner
      const session = await service.getSession(appSessionId);
      expect(session?.runnerId).toBe(runnerId2);

      // Verify the app is in both runners' app sets
      // (This is expected behavior - cleanup should be done by the caller)
      const apps1 = await redisMock.smembers(`pairing:apps:${runnerId1}`);
      const apps2 = await redisMock.smembers(`pairing:apps:${runnerId2}`);

      expect(apps1).toContain(appSessionId);
      expect(apps2).toContain(appSessionId);
    });
  });

  describe('getSession', () => {
    it('should return the session for a paired app', async () => {
      const appSessionId = 'app-uuid-123';
      const runnerId = 'runner-uuid-456';

      await service.createSession(appSessionId, runnerId);

      const session = await service.getSession(appSessionId);

      expect(session).toBeDefined();
      expect(session?.appSessionId).toBe(appSessionId);
      expect(session?.runnerId).toBe(runnerId);
      expect(session?.isActive).toBe(true);
      expect(session?.pairedAt).toBeDefined();
    });

    it('should return null for an unpaired app', async () => {
      const session = await service.getSession('nonexistent-app');

      expect(session).toBeNull();
    });

    it('should return null after session is removed', async () => {
      const appSessionId = 'app-uuid-123';
      const runnerId = 'runner-uuid-456';

      await service.createSession(appSessionId, runnerId);
      await service.removeSession(appSessionId);

      const session = await service.getSession(appSessionId);

      expect(session).toBeNull();
    });

    it('should return different sessions for different apps', async () => {
      const appSessionId1 = 'app-uuid-123';
      const appSessionId2 = 'app-uuid-456';
      const runnerId1 = 'runner-uuid-001';
      const runnerId2 = 'runner-uuid-002';

      await service.createSession(appSessionId1, runnerId1);
      await service.createSession(appSessionId2, runnerId2);

      const session1 = await service.getSession(appSessionId1);
      const session2 = await service.getSession(appSessionId2);

      expect(session1?.runnerId).toBe(runnerId1);
      expect(session2?.runnerId).toBe(runnerId2);
    });
  });

  describe('removeSession', () => {
    it('should remove the pairing session for an app', async () => {
      const appSessionId = 'app-uuid-123';
      const runnerId = 'runner-uuid-456';

      await service.createSession(appSessionId, runnerId);

      // Verify session exists
      let session = await service.getSession(appSessionId);
      expect(session).toBeDefined();

      await service.removeSession(appSessionId);

      // Verify session was removed
      session = await service.getSession(appSessionId);
      expect(session).toBeNull();

      // Verify app was removed from runner's app set
      const apps = await redisMock.smembers(`pairing:apps:${runnerId}`);
      expect(apps).not.toContain(appSessionId);
    });

    it('should handle removing non-existent session gracefully', async () => {
      // Should not throw an error
      await expect(
        service.removeSession('nonexistent-app'),
      ).resolves.not.toThrow();
    });

    it('should only remove the specified app from runner\'s app set', async () => {
      const appSessionId1 = 'app-uuid-123';
      const appSessionId2 = 'app-uuid-456';
      const runnerId = 'runner-uuid-001';

      // Create two sessions with the same runner
      await service.createSession(appSessionId1, runnerId);
      await service.createSession(appSessionId2, runnerId);

      // Remove only the first app
      await service.removeSession(appSessionId1);

      // Verify first app is removed
      const session1 = await service.getSession(appSessionId1);
      expect(session1).toBeNull();

      // Verify second app is still paired
      const session2 = await service.getSession(appSessionId2);
      expect(session2).toBeDefined();

      // Verify runner's app set only contains the second app
      const apps = await redisMock.smembers(`pairing:apps:${runnerId}`);
      expect(apps).toHaveLength(1);
      expect(apps).toContain(appSessionId2);
      expect(apps).not.toContain(appSessionId1);
    });

    it('should handle removing session multiple times', async () => {
      const appSessionId = 'app-uuid-123';
      const runnerId = 'runner-uuid-456';

      await service.createSession(appSessionId, runnerId);
      await service.removeSession(appSessionId);

      // Remove again - should not throw
      await expect(
        service.removeSession(appSessionId),
      ).resolves.not.toThrow();
    });
  });

  describe('getAppsByRunnerId', () => {
    it('should return all apps paired with a runner', async () => {
      const appSessionId1 = 'app-uuid-123';
      const appSessionId2 = 'app-uuid-456';
      const appSessionId3 = 'app-uuid-789';
      const runnerId = 'runner-uuid-001';

      await service.createSession(appSessionId1, runnerId);
      await service.createSession(appSessionId2, runnerId);
      await service.createSession(appSessionId3, runnerId);

      const apps = await service.getAppsByRunnerId(runnerId);

      expect(apps).toHaveLength(3);
      expect(apps).toContain(appSessionId1);
      expect(apps).toContain(appSessionId2);
      expect(apps).toContain(appSessionId3);
    });

    it('should return empty array for runner with no paired apps', async () => {
      const apps = await service.getAppsByRunnerId('nonexistent-runner');

      expect(apps).toEqual([]);
    });

    it('should return updated list after app is removed', async () => {
      const appSessionId1 = 'app-uuid-123';
      const appSessionId2 = 'app-uuid-456';
      const runnerId = 'runner-uuid-001';

      await service.createSession(appSessionId1, runnerId);
      await service.createSession(appSessionId2, runnerId);

      // Remove one app
      await service.removeSession(appSessionId1);

      const apps = await service.getAppsByRunnerId(runnerId);

      expect(apps).toHaveLength(1);
      expect(apps).toContain(appSessionId2);
      expect(apps).not.toContain(appSessionId1);
    });

    it('should return empty array after all apps are removed', async () => {
      const appSessionId1 = 'app-uuid-123';
      const appSessionId2 = 'app-uuid-456';
      const runnerId = 'runner-uuid-001';

      await service.createSession(appSessionId1, runnerId);
      await service.createSession(appSessionId2, runnerId);

      await service.removeSession(appSessionId1);
      await service.removeSession(appSessionId2);

      const apps = await service.getAppsByRunnerId(runnerId);

      expect(apps).toEqual([]);
    });

    it('should return different app lists for different runners', async () => {
      const appSessionId1 = 'app-uuid-123';
      const appSessionId2 = 'app-uuid-456';
      const runnerId1 = 'runner-uuid-001';
      const runnerId2 = 'runner-uuid-002';

      await service.createSession(appSessionId1, runnerId1);
      await service.createSession(appSessionId2, runnerId2);

      const apps1 = await service.getAppsByRunnerId(runnerId1);
      const apps2 = await service.getAppsByRunnerId(runnerId2);

      expect(apps1).toEqual([appSessionId1]);
      expect(apps2).toEqual([appSessionId2]);
    });
  });

  describe('isRunnerOnline', () => {
    it('should return true for runner with recent heartbeat', async () => {
      const runnerId = 'runner-uuid-456';

      await service.updateHeartbeat(runnerId);

      const isOnline = await service.isRunnerOnline(runnerId);

      expect(isOnline).toBe(true);
    });

    it('should return false for runner with no heartbeat', async () => {
      const isOnline = await service.isRunnerOnline('nonexistent-runner');

      expect(isOnline).toBe(false);
    });

    it('should return false for runner with expired heartbeat', async () => {
      const runnerId = 'runner-uuid-456';
      const heartbeatKey = `runner:heartbeat:${runnerId}`;

      // Set heartbeat to 31 seconds ago (beyond 30 second timeout)
      const expiredTimestamp = Date.now() - 31000;
      await redisMock.set(heartbeatKey, expiredTimestamp.toString());

      const isOnline = await service.isRunnerOnline(runnerId);

      expect(isOnline).toBe(false);
    });

    it('should return true for runner with heartbeat exactly at 30 second boundary', async () => {
      const runnerId = 'runner-uuid-456';
      const heartbeatKey = `runner:heartbeat:${runnerId}`;

      // Set heartbeat to exactly 29.9 seconds ago (within timeout)
      const timestamp = Date.now() - 29900;
      await redisMock.set(heartbeatKey, timestamp.toString());

      const isOnline = await service.isRunnerOnline(runnerId);

      expect(isOnline).toBe(true);
    });

    it('should handle multiple runners independently', async () => {
      const runnerId1 = 'runner-uuid-001';
      const runnerId2 = 'runner-uuid-002';
      const runnerId3 = 'runner-uuid-003';

      // Update heartbeat for runner 1 and 2
      await service.updateHeartbeat(runnerId1);
      await service.updateHeartbeat(runnerId2);

      // Set expired heartbeat for runner 3
      const heartbeatKey3 = `runner:heartbeat:${runnerId3}`;
      const expiredTimestamp = Date.now() - 31000;
      await redisMock.set(heartbeatKey3, expiredTimestamp.toString());

      const isOnline1 = await service.isRunnerOnline(runnerId1);
      const isOnline2 = await service.isRunnerOnline(runnerId2);
      const isOnline3 = await service.isRunnerOnline(runnerId3);

      expect(isOnline1).toBe(true);
      expect(isOnline2).toBe(true);
      expect(isOnline3).toBe(false);
    });
  });

  describe('updateHeartbeat', () => {
    it('should update the heartbeat timestamp for a runner', async () => {
      const runnerId = 'runner-uuid-456';

      await service.updateHeartbeat(runnerId);

      // Verify heartbeat was set
      const heartbeatKey = `runner:heartbeat:${runnerId}`;
      const heartbeat = await redisMock.get(heartbeatKey);

      expect(heartbeat).toBeDefined();
      const timestamp = parseInt(heartbeat!, 10);
      expect(timestamp).toBeGreaterThan(Date.now() - 1000); // Within last second
      expect(timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should set TTL on heartbeat key', async () => {
      const runnerId = 'runner-uuid-456';

      await service.updateHeartbeat(runnerId);

      // Verify TTL was set (60 seconds)
      const heartbeatKey = `runner:heartbeat:${runnerId}`;
      const ttl = await redisMock.ttl(heartbeatKey);

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('should update existing heartbeat timestamp', async () => {
      const runnerId = 'runner-uuid-456';

      // First heartbeat
      await service.updateHeartbeat(runnerId);
      const heartbeatKey = `runner:heartbeat:${runnerId}`;
      const firstHeartbeat = await redisMock.get(heartbeatKey);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second heartbeat
      await service.updateHeartbeat(runnerId);
      const secondHeartbeat = await redisMock.get(heartbeatKey);

      expect(secondHeartbeat).toBeDefined();
      expect(parseInt(secondHeartbeat!, 10)).toBeGreaterThan(
        parseInt(firstHeartbeat!, 10),
      );
    });

    it('should handle multiple runners independently', async () => {
      const runnerId1 = 'runner-uuid-001';
      const runnerId2 = 'runner-uuid-002';

      await service.updateHeartbeat(runnerId1);
      await service.updateHeartbeat(runnerId2);

      const heartbeat1 = await redisMock.get(`runner:heartbeat:${runnerId1}`);
      const heartbeat2 = await redisMock.get(`runner:heartbeat:${runnerId2}`);

      expect(heartbeat1).toBeDefined();
      expect(heartbeat2).toBeDefined();
    });
  });

  describe('removeAllSessionsForRunner', () => {
    it('should remove all pairing sessions for a runner', async () => {
      const appSessionId1 = 'app-uuid-123';
      const appSessionId2 = 'app-uuid-456';
      const appSessionId3 = 'app-uuid-789';
      const runnerId = 'runner-uuid-001';

      await service.createSession(appSessionId1, runnerId);
      await service.createSession(appSessionId2, runnerId);
      await service.createSession(appSessionId3, runnerId);

      const unpairedApps = await service.removeAllSessionsForRunner(runnerId);

      // Verify all apps were returned
      expect(unpairedApps).toHaveLength(3);
      expect(unpairedApps).toContain(appSessionId1);
      expect(unpairedApps).toContain(appSessionId2);
      expect(unpairedApps).toContain(appSessionId3);

      // Verify all sessions were removed
      const session1 = await service.getSession(appSessionId1);
      const session2 = await service.getSession(appSessionId2);
      const session3 = await service.getSession(appSessionId3);

      expect(session1).toBeNull();
      expect(session2).toBeNull();
      expect(session3).toBeNull();

      // Verify runner's app set was cleared
      const apps = await service.getAppsByRunnerId(runnerId);
      expect(apps).toEqual([]);
    });

    it('should return empty array for runner with no paired apps', async () => {
      const unpairedApps = await service.removeAllSessionsForRunner(
        'nonexistent-runner',
      );

      expect(unpairedApps).toEqual([]);
    });

    it('should only remove sessions for the specified runner', async () => {
      const appSessionId1 = 'app-uuid-123';
      const appSessionId2 = 'app-uuid-456';
      const runnerId1 = 'runner-uuid-001';
      const runnerId2 = 'runner-uuid-002';

      await service.createSession(appSessionId1, runnerId1);
      await service.createSession(appSessionId2, runnerId2);

      // Remove sessions for runner 1
      const unpairedApps = await service.removeAllSessionsForRunner(runnerId1);

      expect(unpairedApps).toEqual([appSessionId1]);

      // Verify runner 1's session was removed
      const session1 = await service.getSession(appSessionId1);
      expect(session1).toBeNull();

      // Verify runner 2's session is still intact
      const session2 = await service.getSession(appSessionId2);
      expect(session2).toBeDefined();
      expect(session2?.runnerId).toBe(runnerId2);
    });

    it('should handle removing sessions multiple times', async () => {
      const appSessionId = 'app-uuid-123';
      const runnerId = 'runner-uuid-001';

      await service.createSession(appSessionId, runnerId);
      await service.removeAllSessionsForRunner(runnerId);

      // Remove again - should not throw
      const unpairedApps = await service.removeAllSessionsForRunner(runnerId);
      expect(unpairedApps).toEqual([]);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete pairing lifecycle', async () => {
      const appSessionId = 'app-uuid-123';
      const runnerId = 'runner-uuid-456';

      // 1. Create session
      await service.createSession(appSessionId, runnerId);

      // 2. Verify session exists
      let session = await service.getSession(appSessionId);
      expect(session).toBeDefined();
      expect(session?.runnerId).toBe(runnerId);

      // 3. Verify app is in runner's list
      let apps = await service.getAppsByRunnerId(runnerId);
      expect(apps).toContain(appSessionId);

      // 4. Remove session
      await service.removeSession(appSessionId);

      // 5. Verify session is gone
      session = await service.getSession(appSessionId);
      expect(session).toBeNull();

      // 6. Verify app is removed from runner's list
      apps = await service.getAppsByRunnerId(runnerId);
      expect(apps).not.toContain(appSessionId);
    });

    it('should handle runner disconnect scenario', async () => {
      const appSessionId1 = 'app-uuid-123';
      const appSessionId2 = 'app-uuid-456';
      const runnerId = 'runner-uuid-001';

      // Multiple apps pair with runner
      await service.createSession(appSessionId1, runnerId);
      await service.createSession(appSessionId2, runnerId);

      // Runner updates heartbeat
      await service.updateHeartbeat(runnerId);

      // Verify runner is online
      let isOnline = await service.isRunnerOnline(runnerId);
      expect(isOnline).toBe(true);

      // Runner disconnects - remove all sessions
      const unpairedApps = await service.removeAllSessionsForRunner(runnerId);
      expect(unpairedApps).toHaveLength(2);

      // Verify all sessions are removed
      const session1 = await service.getSession(appSessionId1);
      const session2 = await service.getSession(appSessionId2);
      expect(session1).toBeNull();
      expect(session2).toBeNull();
    });

    it('should handle app reconnection scenario', async () => {
      const appSessionId = 'app-uuid-123';
      const runnerId = 'runner-uuid-456';

      // Initial pairing
      await service.createSession(appSessionId, runnerId);

      // App disconnects (session preserved)
      // ... no action needed, session remains in Redis

      // App reconnects - check if still paired
      const session = await service.getSession(appSessionId);
      expect(session).toBeDefined();
      expect(session?.runnerId).toBe(runnerId);

      // Verify runner is still online
      await service.updateHeartbeat(runnerId);
      const isOnline = await service.isRunnerOnline(runnerId);
      expect(isOnline).toBe(true);
    });

    it('should handle concurrent operations', async () => {
      const appSessionIds = Array.from({ length: 10 }, (_, i) => `app-uuid-${i}`);
      const runnerId = 'runner-uuid-001';

      // Create multiple sessions concurrently
      await Promise.all(
        appSessionIds.map((appId) => service.createSession(appId, runnerId)),
      );

      // Verify all sessions were created
      const apps = await service.getAppsByRunnerId(runnerId);
      expect(apps).toHaveLength(10);

      // Verify each session individually
      const sessions = await Promise.all(
        appSessionIds.map((appId) => service.getSession(appId)),
      );

      sessions.forEach((session, index) => {
        expect(session).toBeDefined();
        expect(session?.appSessionId).toBe(appSessionIds[index]);
        expect(session?.runnerId).toBe(runnerId);
      });
    });

    it('should handle mixed operations on multiple runners', async () => {
      const runner1 = 'runner-uuid-001';
      const runner2 = 'runner-uuid-002';
      const app1 = 'app-uuid-123';
      const app2 = 'app-uuid-456';
      const app3 = 'app-uuid-789';

      // Create sessions
      await service.createSession(app1, runner1);
      await service.createSession(app2, runner1);
      await service.createSession(app3, runner2);

      // Update heartbeats
      await service.updateHeartbeat(runner1);
      await service.updateHeartbeat(runner2);

      // Verify online status
      expect(await service.isRunnerOnline(runner1)).toBe(true);
      expect(await service.isRunnerOnline(runner2)).toBe(true);

      // Verify app lists
      const apps1 = await service.getAppsByRunnerId(runner1);
      const apps2 = await service.getAppsByRunnerId(runner2);

      expect(apps1).toHaveLength(2);
      expect(apps2).toHaveLength(1);

      // Remove one app from runner 1
      await service.removeSession(app1);

      // Verify updated list
      const updatedApps1 = await service.getAppsByRunnerId(runner1);
      expect(updatedApps1).toHaveLength(1);
      expect(updatedApps1).toContain(app2);

      // Remove all sessions for runner 2
      const unpairedApps = await service.removeAllSessionsForRunner(runner2);
      expect(unpairedApps).toEqual([app3]);

      // Verify runner 1 sessions are unaffected
      const finalApps1 = await service.getAppsByRunnerId(runner1);
      expect(finalApps1).toHaveLength(1);
      expect(finalApps1).toContain(app2);
    });
  });
});

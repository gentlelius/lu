/**
 * Tests for RedisService
 */

import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../redis.service';
import RedisMock from 'ioredis-mock';

// Mock the ioredis module to use ioredis-mock
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    return new RedisMock();
  });
});

describe('RedisService', () => {
  let service: RedisService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [RedisService],
    }).compile();

    service = module.get<RedisService>(RedisService);
    await service.onModuleInit();
    
    // Clear all data before each test
    const client = service.getClient();
    await client.flushdb();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    await module.close();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should provide a Redis client', () => {
      const client = service.getClient();
      expect(client).toBeDefined();
    });
  });

  describe('basic operations', () => {
    it('should set and get a value', async () => {
      const client = service.getClient();
      await client.set('test-key', 'test-value');
      const value = await client.get('test-key');
      expect(value).toBe('test-value');
    });

    it('should delete a value', async () => {
      const client = service.getClient();
      await client.set('test-key', 'test-value');
      await client.del('test-key');
      const value = await client.get('test-key');
      expect(value).toBeNull();
    });

    it('should set expiration time', async () => {
      const client = service.getClient();
      await client.set('test-key', 'test-value');
      await client.expire('test-key', 1);
      const ttl = await client.ttl('test-key');
      expect(ttl).toBeGreaterThan(0);
    });

    it('should use SETNX for atomic operations', async () => {
      const client = service.getClient();
      
      // First SETNX should succeed
      const result1 = await client.setnx('unique-key', 'value1');
      expect(result1).toBe(1);
      
      // Second SETNX should fail (key already exists)
      const result2 = await client.setnx('unique-key', 'value2');
      expect(result2).toBe(0);
      
      // Value should still be the first one
      const value = await client.get('unique-key');
      expect(value).toBe('value1');
    });
  });

  describe('set operations', () => {
    it('should add members to a set', async () => {
      const client = service.getClient();
      await client.sadd('test-set', 'member1', 'member2', 'member3');
      const members = await client.smembers('test-set');
      expect(members).toHaveLength(3);
      expect(members).toContain('member1');
      expect(members).toContain('member2');
      expect(members).toContain('member3');
    });

    it('should remove members from a set', async () => {
      const client = service.getClient();
      await client.sadd('test-set', 'member1', 'member2');
      await client.srem('test-set', 'member1');
      const members = await client.smembers('test-set');
      expect(members).toHaveLength(1);
      expect(members).toContain('member2');
    });
  });

  describe('sorted set operations', () => {
    it('should add members to a sorted set', async () => {
      const client = service.getClient();
      await client.zadd('test-zset', 1, 'member1', 2, 'member2', 3, 'member3');
      const count = await client.zcard('test-zset');
      expect(count).toBe(3);
    });

    it('should remove members by score range', async () => {
      const client = service.getClient();
      await client.zadd('test-zset', 1, 'member1', 2, 'member2', 3, 'member3');
      await client.zremrangebyscore('test-zset', 0, 1);
      const count = await client.zcard('test-zset');
      expect(count).toBe(2);
    });
  });

  describe('list operations', () => {
    it('should push and pop from a list', async () => {
      const client = service.getClient();
      await client.lpush('test-list', 'item1', 'item2', 'item3');
      const length = await client.llen('test-list');
      expect(length).toBe(3);
      
      const item = await client.lpop('test-list');
      expect(item).toBe('item3'); // LPUSH adds to the left, so last item is first
    });

    it('should trim a list', async () => {
      const client = service.getClient();
      await client.lpush('test-list', 'item1', 'item2', 'item3', 'item4', 'item5');
      await client.ltrim('test-list', 0, 2);
      const length = await client.llen('test-list');
      expect(length).toBe(3);
    });

    it('should get a range from a list', async () => {
      const client = service.getClient();
      await client.lpush('test-list', 'item1', 'item2', 'item3');
      const items = await client.lrange('test-list', 0, -1);
      expect(items).toHaveLength(3);
    });
  });
});

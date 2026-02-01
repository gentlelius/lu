import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Redis module for managing Redis connections
 * 
 * This module provides a singleton Redis service that can be injected
 * into other services throughout the application.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}

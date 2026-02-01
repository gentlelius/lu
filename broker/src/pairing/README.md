# Pairing Module

This module implements the pairing functionality for the runner-app pairing system.

## Overview

The pairing module provides the infrastructure for managing pairing codes, sessions, rate limiting, and history tracking between runners and mobile apps.

## Structure

```
pairing/
├── types/              # Shared type definitions
│   ├── pairing.types.ts
│   └── index.ts
├── redis/              # Redis connection management
│   ├── redis.module.ts
│   ├── redis.service.ts
│   ├── __tests__/
│   └── index.ts
└── README.md
```

## Components

### Types (`types/pairing.types.ts`)

Defines all core data structures:

- **PairingCodeEntry**: Pairing code registration information
- **PairingSession**: App-to-runner pairing session
- **RateLimitEntry**: Rate limiting tracking data
- **PairingHistoryEntry**: Historical pairing event records
- **PairingErrorCode**: Standardized error codes enum

### Redis Module (`redis/`)

Provides Redis connection management:

- **RedisModule**: NestJS module for Redis
- **RedisService**: Service for accessing Redis client

## Configuration

Redis connection is configured via environment variables:

```bash
REDIS_HOST=localhost      # Redis server host
REDIS_PORT=6379          # Redis server port
REDIS_PASSWORD=          # Redis password (optional)
REDIS_DB=0              # Redis database number
```

## Testing

The module uses:
- **Jest**: Test framework
- **fast-check**: Property-based testing
- **ioredis-mock**: Redis mocking for tests

Run tests:
```bash
pnpm test              # Run all tests
pnpm test:watch        # Run tests in watch mode
pnpm test:cov          # Run tests with coverage
```

## Dependencies

### Production
- `ioredis`: Redis client for Node.js

### Development
- `jest`: Testing framework
- `fast-check`: Property-based testing library
- `ioredis-mock`: Mock Redis for testing
- `ts-jest`: TypeScript support for Jest
- `@nestjs/testing`: NestJS testing utilities

## Next Steps

The following components will be implemented in subsequent tasks:

1. **PairingCodeService**: Pairing code generation and validation
2. **PairingSessionService**: Session management
3. **RateLimitService**: Rate limiting and ban management
4. **PairingHistoryService**: History tracking
5. **PairingGateway**: WebSocket gateway for pairing events

## References

- Design Document: `.kiro/specs/runner-app-pairing/design.md`
- Requirements: `.kiro/specs/runner-app-pairing/requirements.md`
- Tasks: `.kiro/specs/runner-app-pairing/tasks.md`

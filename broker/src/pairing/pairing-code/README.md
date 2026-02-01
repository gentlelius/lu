# Pairing Code Service

The `PairingCodeService` manages the lifecycle of pairing codes in the runner-app pairing system. It provides atomic operations for registering, validating, and invalidating pairing codes using Redis as the storage backend.

## Overview

Pairing codes are 9-character strings (format: `XXX-XXX-XXX`) that allow mobile apps to securely pair with runner instances. The service ensures uniqueness through multiple layers of protection:

1. **Statistical Uniqueness**: 36^9 ≈ 101 trillion possible codes
2. **Atomic Checks**: Redis SETNX guarantees no duplicates
3. **Retry Mechanism**: Automatic retry on collision (up to 3 attempts)

## Key Features

- **Atomic Registration**: Uses Redis SETNX for collision-free code registration
- **Bidirectional Mapping**: Maintains both code→runner and runner→code indexes
- **Automatic Expiration**: Codes expire after 24 hours (configurable)
- **Usage Tracking**: Tracks how many times a code has been used
- **Retry Logic**: Built-in retry mechanism for handling rare collisions

## API Reference

### `registerCode(code: string, runnerId: string): Promise<void>`

Registers a new pairing code with atomic uniqueness check.

**Parameters:**
- `code`: The pairing code to register (format: XXX-XXX-XXX)
- `runnerId`: The unique identifier of the runner

**Throws:**
- `Error` with message `DUPLICATE_CODE` if the code already exists

**Example:**
```typescript
try {
  await service.registerCode('ABC-123-XYZ', 'runner-uuid-123');
  console.log('Code registered successfully');
} catch (error) {
  if (error.message === 'DUPLICATE_CODE') {
    // Generate a new code and retry
  }
}
```

### `validateCode(code: string): Promise<ValidationResult>`

Validates a pairing code and returns the associated runner ID.

**Parameters:**
- `code`: The pairing code to validate

**Returns:**
```typescript
{
  valid: boolean;
  runnerId?: string;
  error?: string; // 'CODE_NOT_FOUND' | 'CODE_EXPIRED'
}
```

**Example:**
```typescript
const result = await service.validateCode('ABC-123-XYZ');
if (result.valid) {
  console.log('Runner ID:', result.runnerId);
} else {
  console.log('Error:', result.error);
}
```

### `invalidateCode(code: string): Promise<void>`

Invalidates a pairing code, removing it from Redis.

**Parameters:**
- `code`: The pairing code to invalidate

**Example:**
```typescript
await service.invalidateCode('ABC-123-XYZ');
console.log('Code invalidated');
```

### `findCodeByRunnerId(runnerId: string): Promise<string | null>`

Finds the pairing code associated with a runner ID.

**Parameters:**
- `runnerId`: The unique identifier of the runner

**Returns:**
- The pairing code if found, `null` otherwise

**Example:**
```typescript
const code = await service.findCodeByRunnerId('runner-uuid-123');
if (code) {
  console.log('Pairing code:', code);
}
```

### `registerCodeWithRetry(codeGenerator: () => string, runnerId: string): Promise<string>`

Registers a pairing code with automatic retry on collision.

**Parameters:**
- `codeGenerator`: Function that generates a new pairing code
- `runnerId`: The unique identifier of the runner

**Returns:**
- The successfully registered pairing code

**Throws:**
- `Error` if registration fails after all retries (3 attempts)

**Example:**
```typescript
const generator = new PairingCodeGenerator();
const code = await service.registerCodeWithRetry(
  () => generator.generate(),
  'runner-uuid-123'
);
console.log('Registered code:', code);
```

### `incrementUsageCount(code: string): Promise<void>`

Increments the usage count for a pairing code.

**Parameters:**
- `code`: The pairing code that was used

**Example:**
```typescript
await service.incrementUsageCount('ABC-123-XYZ');
```

## Redis Data Structure

### Pairing Code Entry
**Key:** `pairing:code:{code}`  
**Type:** String (JSON)  
**TTL:** 24 hours  
**Value:**
```typescript
{
  code: string;
  runnerId: string;
  createdAt: number;
  expiresAt: number;
  usedCount: number;
  isActive: boolean;
}
```

### Reverse Index
**Key:** `pairing:runner:{runnerId}`  
**Type:** String  
**Value:** The pairing code

## Configuration

The service uses the following constants:

- `CODE_TTL`: 24 hours (86400 seconds)
- `MAX_RETRIES`: 3 attempts

These can be modified in the service class if needed.

## Error Handling

The service uses standardized error codes from `PairingErrorCode`:

- `DUPLICATE_CODE`: Code already exists (during registration)
- `CODE_NOT_FOUND`: Code does not exist
- `CODE_EXPIRED`: Code has expired or is inactive

## Testing

The service includes comprehensive unit tests covering:

- ✅ Successful code registration
- ✅ Duplicate code detection
- ✅ Code validation (valid, not found, expired, inactive)
- ✅ Code invalidation
- ✅ Reverse lookup by runner ID
- ✅ Retry mechanism (1-3 attempts)
- ✅ Usage count tracking
- ✅ Concurrent operations
- ✅ Edge cases and error handling

Run tests with:
```bash
pnpm test pairing-code.service.test.ts
```

## Requirements Validation

This service implements the following requirements:

- **1.5**: Register pairing code to broker
- **3.2**: Validate pairing code format
- **3.3**: Find corresponding runner
- **4.2**: Invalidate code when runner disconnects
- **5.1**: Record generation timestamp
- **5.4**: Remove expired codes
- **11.1**: Check if code already exists
- **11.2**: Reject duplicate registration
- **11.4**: Remove code from registry when invalidated

## Integration

To use the service in your module:

```typescript
import { Module } from '@nestjs/common';
import { PairingCodeService } from './pairing-code/pairing-code.service';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [PairingCodeService],
  exports: [PairingCodeService],
})
export class PairingModule {}
```

## Performance Considerations

- All Redis operations are O(1) complexity
- SETNX provides atomic uniqueness checks without locks
- TTL-based expiration eliminates need for manual cleanup
- Bidirectional indexes enable fast lookups in both directions

## Security

- Uses cryptographically secure random generation (via PairingCodeGenerator)
- Atomic operations prevent race conditions
- Automatic expiration limits attack window
- No sensitive data stored in Redis (codes are meant to be shared)

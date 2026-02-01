# Rate Limit Service

## Overview

The `RateLimitService` implements rate limiting for pairing attempts to prevent brute-force attacks on pairing codes. It uses a sliding window algorithm implemented with Redis Sorted Sets for accurate and efficient rate limiting.

## Features

- **Sliding Window Rate Limiting**: Tracks failed attempts over a rolling 1-minute window
- **Automatic Banning**: Bans sessions that exceed 5 failed attempts in 1 minute
- **Temporary Bans**: Bans last for 5 minutes
- **Automatic Cleanup**: Uses Redis TTL for automatic memory management
- **Counter Reset**: Clears counters on successful pairing

## Rate Limiting Strategy

| Parameter | Value | Description |
|-----------|-------|-------------|
| Window | 1 minute | Time window for counting attempts |
| Max Attempts | 5 | Maximum failed attempts allowed |
| Ban Duration | 5 minutes | How long a session is banned |

## Security Analysis

With these settings, even if an attacker tries to brute-force pairing codes:
- They can only try 5 codes per minute
- After 5 attempts, they're banned for 5 minutes
- To guess a 9-character code (36^9 ≈ 101 trillion possibilities):
  - At 5 attempts per minute, it would take approximately **38 million years**

## Redis Data Structures

### Attempts Tracking
```
Key: ratelimit:attempts:{appSessionId}
Type: Sorted Set
Score: timestamp (milliseconds)
Member: attempt ID (timestamp as string)
TTL: 60 seconds
```

### Ban Records
```
Key: ratelimit:ban:{appSessionId}
Type: String
Value: banned until timestamp (milliseconds)
TTL: 300 seconds
```

## Usage

### Check if a session is banned

```typescript
const banned = await rateLimitService.isBanned('app-session-123');
if (banned) {
  const remaining = await rateLimitService.getRemainingBanTime('app-session-123');
  throw new Error(`Banned for ${remaining} more seconds`);
}
```

### Record a failed attempt

```typescript
// After a failed pairing attempt
await rateLimitService.recordFailedAttempt('app-session-123');
```

### Reset counter on success

```typescript
// After successful pairing
await rateLimitService.reset('app-session-123');
```

### Get remaining ban time

```typescript
const remaining = await rateLimitService.getRemainingBanTime('app-session-123');
console.log(`Please wait ${remaining} seconds`);
```

## Implementation Details

### Sliding Window Algorithm

The service uses Redis Sorted Sets to implement a sliding window:

1. **Add Attempt**: Each failed attempt is added to a sorted set with the current timestamp as the score
2. **Remove Old**: Attempts older than 1 minute are automatically removed
3. **Count**: The number of remaining attempts is counted
4. **Ban**: If count >= 5, the session is banned for 5 minutes

This approach provides accurate rate limiting without the edge cases of fixed windows (e.g., 5 attempts at 11:59 and 5 more at 12:00).

### Automatic Cleanup

Both the attempts counter and ban records use Redis TTL:
- Attempts counter expires after 60 seconds
- Ban records expire after 300 seconds

This ensures that Redis memory is automatically cleaned up without manual intervention.

## Requirements Mapping

| Requirement | Description | Implementation |
|-------------|-------------|----------------|
| 6.1 | Ban after 5 failed attempts in 1 minute | `recordFailedAttempt()` with sliding window |
| 6.2 | Reject requests during ban | `isBanned()` check |
| 6.3 | Auto-unban after 5 minutes | Redis TTL + `isBanned()` expiry check |
| 6.4 | Record failed attempts | Sorted Set with timestamps |

## Testing

The service should be tested with:
- Unit tests for individual methods
- Property-based tests for rate limiting behavior
- Integration tests with Redis

See `__tests__/rate-limit.service.test.ts` for test cases.

## Performance Considerations

- All Redis operations are O(log N) or better
- Sorted Set operations are efficient even with many attempts
- TTL ensures bounded memory usage
- No manual cleanup required

## Error Handling

The service does not throw errors. Instead:
- `isBanned()` returns `false` if Redis is unavailable (fail open)
- `recordFailedAttempt()` logs errors but continues
- `reset()` is idempotent and safe to call multiple times
- `getRemainingBanTime()` returns `0` if Redis is unavailable

This ensures that rate limiting failures don't break the pairing flow.

# Continuous Validity for Used Pairing Codes

## Overview

This document describes the implementation of **Requirement 5.3**: "WHEN 配对码已被使用（至少一次成功配对）时，THE Broker SHALL 允许该配对码继续有效直到 runner 断开"

## Implementation Summary

Once a pairing code has been successfully used for at least one pairing (usedCount > 0), it remains valid indefinitely until the runner disconnects, bypassing the standard 24-hour expiration limit.

## Key Changes

### 1. Modified `validateCode` Method

**File**: `broker/src/pairing/pairing-code/pairing-code.service.ts`

The validation logic now checks if a code has been used before applying the expiration check:

```typescript
// Check if the code has expired
// Used codes (usedCount > 0) remain valid indefinitely (Requirement 5.3)
const now = Date.now();
if (entry.usedCount === 0 && now > entry.expiresAt) {
  this.logger.debug(`Pairing code has expired: ${code}`);
  // Automatically invalidate the expired code
  await this.invalidateCode(code);
  return { valid: false, error: PairingErrorCode.CODE_EXPIRED };
}
```

**Behavior**:
- **Unused codes** (usedCount === 0): Expire after 24 hours
- **Used codes** (usedCount > 0): Never expire based on time, remain valid until runner disconnects

### 2. Modified `incrementUsageCount` Method

**File**: `broker/src/pairing/pairing-code/pairing-code.service.ts`

When a code is used for the first time, the Redis TTL is removed:

```typescript
async incrementUsageCount(code: string): Promise<void> {
  const redis = this.redisService.getClient();
  const key = `pairing:code:${code}`;
  
  const data = await redis.get(key);
  if (data) {
    const entry: PairingCodeEntry = JSON.parse(data);
    const wasUnused = entry.usedCount === 0;
    entry.usedCount++;
    
    // Update the entry in Redis
    await redis.set(key, JSON.stringify(entry));
    
    // If this is the first use, remove TTL to make it valid indefinitely
    if (wasUnused) {
      await redis.persist(key);
      this.logger.log(`Pairing code ${code} marked as used, TTL removed (continuous validity)`);
    }
    
    this.logger.debug(`Incremented usage count for code ${code}: ${entry.usedCount}`);
  }
}
```

**Behavior**:
- On first use (usedCount: 0 → 1): Calls `redis.persist(key)` to remove the TTL
- On subsequent uses: No TTL modification needed (already persisted)

## Lifecycle Flow

### Unused Code (Standard Flow)

```
1. Runner registers code
   └─> Redis: SET pairing:code:ABC-123-XYZ (with 24h TTL)

2. Time passes (< 24 hours)
   └─> Code remains valid

3. Time passes (> 24 hours)
   └─> Redis automatically deletes the key (TTL expired)
   └─> validateCode returns CODE_EXPIRED
```

### Used Code (Continuous Validity)

```
1. Runner registers code
   └─> Redis: SET pairing:code:ABC-123-XYZ (with 24h TTL)

2. First successful pairing
   └─> incrementUsageCount called
   └─> Redis: PERSIST pairing:code:ABC-123-XYZ (TTL removed)
   └─> usedCount: 0 → 1

3. Time passes (> 24 hours)
   └─> Code remains valid (no TTL)
   └─> validateCode returns valid

4. Additional pairings
   └─> incrementUsageCount called
   └─> usedCount: 1 → 2, 2 → 3, etc.
   └─> Code remains valid

5. Runner disconnects
   └─> invalidateCode called
   └─> Redis: DEL pairing:code:ABC-123-XYZ
   └─> Code is removed
```

## Redis Commands Used

### PERSIST
Removes the TTL from a key, making it persist indefinitely:
```
PERSIST pairing:code:ABC-123-XYZ
```

### TTL
Returns the remaining time to live of a key:
- `-1`: Key exists but has no TTL (persisted)
- `-2`: Key does not exist
- `> 0`: Remaining seconds until expiration

## Testing

### Unit Tests

**File**: `broker/src/pairing/pairing-code/__tests__/pairing-code.service.test.ts`

1. **Test: "should NOT expire used codes even after 24 hours (Requirement 5.3)"**
   - Creates an expired code entry with usedCount > 0
   - Validates that the code is still considered valid
   - Verifies the code is NOT invalidated

2. **Test: "should remove TTL when code is used for the first time (Requirement 5.3)"**
   - Registers a code (with TTL)
   - Increments usage count
   - Verifies TTL is removed (TTL = -1)

3. **Test: "should keep code valid indefinitely after first use"**
   - Registers a code
   - Uses it multiple times
   - Verifies TTL remains -1 after each use

### Integration Tests

All existing integration tests pass, confirming backward compatibility.

## Security Considerations

### Why This Is Safe

1. **Runner Control**: Used codes only remain valid while the runner is connected
   - When runner disconnects, `invalidateCode` is called
   - This removes the code from Redis entirely

2. **No Indefinite Accumulation**: 
   - Codes are tied to active runner connections
   - When runner disconnects, the code is cleaned up
   - No risk of Redis memory bloat

3. **Maintains Security Goals**:
   - Unused codes still expire after 24 hours (prevents leaked codes)
   - Used codes require active runner connection (prevents stale access)
   - Rate limiting still applies to pairing attempts

### Attack Scenarios Addressed

**Scenario 1: Leaked Unused Code**
- Code expires after 24 hours if never used
- Attacker cannot use old leaked codes

**Scenario 2: Leaked Used Code**
- Code remains valid, BUT:
  - Rate limiting prevents brute force
  - Runner must be online
  - Runner owner can disconnect to invalidate

**Scenario 3: Runner Stays Online Forever**
- This is intentional behavior
- Runner owner controls when to disconnect
- Multiple apps can legitimately pair with same runner

## Monitoring and Observability

### Log Messages

**When code is first used**:
```
[PairingCodeService] Pairing code ABC-123-XYZ marked as used, TTL removed (continuous validity)
```

**When validating used code**:
```
[PairingCodeService] Pairing code validated: ABC-123-XYZ for runner: runner-uuid-123
```

### Metrics to Track

1. **Ratio of used vs unused codes**
   - High ratio indicates active usage
   - Low ratio might indicate codes not being shared

2. **Average code lifetime**
   - Used codes: Until runner disconnect
   - Unused codes: Up to 24 hours

3. **Code reuse count**
   - Track usedCount distribution
   - Identify popular runners

## Related Requirements

- **Requirement 5.1**: Record generation timestamp ✓
- **Requirement 5.2**: Expire unused codes after 24 hours ✓
- **Requirement 5.3**: Keep used codes valid until runner disconnect ✓ (This implementation)
- **Requirement 5.4**: Remove expired codes from registry ✓

## Future Enhancements

1. **Configurable Expiration**
   - Allow different expiration times for different runner types
   - Example: Premium runners get longer expiration

2. **Usage Analytics**
   - Track which codes are most frequently used
   - Identify patterns in pairing behavior

3. **Manual Code Refresh**
   - Allow runner to manually refresh code while staying connected
   - Useful for security-conscious users

## References

- Design Document: Property 11 (已使用配对码持续有效)
- Requirements Document: Requirement 5.3
- Task List: Task 13.2

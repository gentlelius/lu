# Pairing History Service

## Overview

The `PairingHistoryService` manages the historical record of pairing events for auditing and troubleshooting purposes. It maintains a fixed-size list of the most recent pairing attempts (both successful and failed) to help administrators track system usage and diagnose issues.

## Features

- **Event Recording**: Records all pairing events with complete context
- **Fixed-Size Storage**: Automatically maintains a maximum of 1000 entries
- **Efficient Retrieval**: Provides paginated access to historical records
- **Non-Blocking**: History recording failures don't affect pairing operations

## Storage Strategy

The service uses Redis List data structure with the following operations:

- **LPUSH**: Adds new entries to the head (most recent first)
- **LTRIM**: Automatically removes oldest entries when limit is exceeded
- **LRANGE**: Retrieves entries with pagination support

### Redis Key Design

```
pairing:history -> List of JSON-serialized PairingHistoryEntry objects
```

## API Reference

### `record(entry: PairingHistoryEntry): Promise<void>`

Records a pairing event (success or failure).

**Parameters:**
- `entry`: The pairing history entry containing:
  - `timestamp`: Event timestamp in milliseconds
  - `appSessionId`: App's WebSocket session ID
  - `runnerId`: Runner ID (null if pairing failed)
  - `pairingCode`: The pairing code that was attempted
  - `success`: Whether the pairing succeeded
  - `errorCode`: Error code if pairing failed (optional)

**Example:**
```typescript
// Record successful pairing
await historyService.record({
  timestamp: Date.now(),
  appSessionId: 'app-session-123',
  runnerId: 'runner-456',
  pairingCode: 'ABC-123-XYZ',
  success: true
});

// Record failed pairing
await historyService.record({
  timestamp: Date.now(),
  appSessionId: 'app-session-789',
  runnerId: null,
  pairingCode: 'XYZ-789-ABC',
  success: false,
  errorCode: PairingErrorCode.CODE_NOT_FOUND
});
```

### `getHistory(limit?: number): Promise<PairingHistoryEntry[]>`

Retrieves historical pairing records in reverse chronological order (most recent first).

**Parameters:**
- `limit`: Maximum number of entries to retrieve (default: 100, max: 1000)

**Returns:** Array of pairing history entries

**Example:**
```typescript
// Get the 10 most recent events
const recent = await historyService.getHistory(10);

// Get all history (up to 1000 entries)
const allHistory = await historyService.getHistory(1000);

// Process entries
recent.forEach(entry => {
  console.log(`${new Date(entry.timestamp).toISOString()}: ${entry.success ? 'SUCCESS' : 'FAILURE'}`);
  if (!entry.success) {
    console.log(`  Error: ${entry.errorCode}`);
  }
});
```

### `getHistoryCount(): Promise<number>`

Returns the total number of history entries currently stored.

**Returns:** Number of entries (max 1000)

**Example:**
```typescript
const count = await historyService.getHistoryCount();
console.log(`Total history entries: ${count}`);
```

### `clearHistory(): Promise<void>`

Removes all history entries. Primarily useful for testing or administrative cleanup.

**Example:**
```typescript
await historyService.clearHistory();
console.log('History cleared');
```

## Implementation Details

### Automatic Size Management

The service automatically maintains the history size at or below 1000 entries:

1. New entries are added with `LPUSH` (to the head of the list)
2. Immediately after, `LTRIM` keeps only indices 0 to 999
3. Oldest entries (at the tail) are automatically removed

This ensures:
- Constant-time insertions (O(1))
- No manual cleanup required
- Memory usage is bounded

### Error Handling

The service is designed to be non-blocking:

- Recording failures are logged but don't throw exceptions
- Retrieval failures return empty arrays rather than throwing
- Parse errors for individual entries are logged and skipped

This ensures that history recording issues don't impact the core pairing functionality.

### Performance Characteristics

- **Record**: O(1) - LPUSH + LTRIM with fixed size
- **Get History**: O(N) where N is the limit parameter
- **Get Count**: O(1) - LLEN operation
- **Clear**: O(1) - DEL operation

## Requirements Mapping

This service implements the following requirements:

- **12.1**: Records pairing events with timestamp, app session ID, and runner ID
- **12.2**: Records failure reasons and attempted pairing codes
- **12.3**: Maintains the most recent 1000 entries
- **12.4**: Automatically deletes oldest records when limit is exceeded

## Usage in Gateway

The PairingHistoryService should be used in the PairingGateway to record all pairing attempts:

```typescript
@WebSocketGateway()
class PairingGateway {
  constructor(
    private readonly historyService: PairingHistoryService,
    // ... other services
  ) {}

  @SubscribeMessage('app:pair')
  async handleAppPair(socket: Socket, data: { pairingCode: string }) {
    try {
      // ... pairing logic ...
      
      // Record success
      await this.historyService.record({
        timestamp: Date.now(),
        appSessionId: socket.id,
        runnerId: validatedRunner.id,
        pairingCode: data.pairingCode,
        success: true
      });
      
      // ... return success response ...
    } catch (error) {
      // Record failure
      await this.historyService.record({
        timestamp: Date.now(),
        appSessionId: socket.id,
        runnerId: null,
        pairingCode: data.pairingCode,
        success: false,
        errorCode: error.code
      });
      
      // ... return error response ...
    }
  }
}
```

## Testing

The service includes comprehensive unit tests covering:

- Recording single and multiple events
- Automatic size limiting (1000 entries)
- History retrieval with various limits
- Error handling and edge cases
- Redis operation failures

See `__tests__/pairing-history.service.test.ts` for details.

# Pairing Session Service

## Overview

The `PairingSessionService` manages pairing sessions between mobile apps and runners in the remote terminal control system. It provides functionality for creating, retrieving, and removing pairing relationships, as well as tracking runner online status.

## Key Features

- **Session Management**: Create and manage pairing sessions between apps and runners
- **Multi-App Support**: One runner can be paired with multiple apps simultaneously
- **Online Status**: Check runner availability via heartbeat mechanism
- **Bidirectional Mapping**: Efficient lookups from app to runner and runner to apps

## Redis Data Structure

### Pairing Session (app -> runner mapping)
```
Key: pairing:session:{appSessionId}
Type: String (JSON)
Value: {
  appSessionId: string,
  runnerId: string,
  pairedAt: number,
  isActive: boolean
}
```

### Runner's App Set (runner -> apps mapping)
```
Key: pairing:apps:{runnerId}
Type: Set
Members: [appSessionId1, appSessionId2, ...]
```

### Runner Heartbeat
```
Key: runner:heartbeat:{runnerId}
Type: String
Value: timestamp (milliseconds)
TTL: 60 seconds
```

## API Reference

### `createSession(appSessionId: string, runnerId: string): Promise<void>`

Creates a new pairing session between an app and a runner.

**Parameters:**
- `appSessionId`: The unique identifier of the app's WebSocket session
- `runnerId`: The unique identifier of the runner

**Example:**
```typescript
await pairingSessionService.createSession('app-uuid-123', 'runner-uuid-456');
```

**Requirements:** 4.1, 4.5

---

### `getSession(appSessionId: string): Promise<PairingSession | null>`

Retrieves the pairing session for a specific app.

**Parameters:**
- `appSessionId`: The unique identifier of the app's WebSocket session

**Returns:**
- `PairingSession` if the app is paired, `null` otherwise

**Example:**
```typescript
const session = await pairingSessionService.getSession('app-uuid-123');
if (session) {
  console.log('Paired with runner:', session.runnerId);
}
```

**Requirements:** 7.1

---

### `removeSession(appSessionId: string): Promise<void>`

Removes a pairing session for an app.

**Parameters:**
- `appSessionId`: The unique identifier of the app's WebSocket session

**Example:**
```typescript
await pairingSessionService.removeSession('app-uuid-123');
```

**Requirements:** 8.1

---

### `getAppsByRunnerId(runnerId: string): Promise<string[]>`

Gets all app session IDs paired with a specific runner.

**Parameters:**
- `runnerId`: The unique identifier of the runner

**Returns:**
- Array of app session IDs

**Example:**
```typescript
const apps = await pairingSessionService.getAppsByRunnerId('runner-uuid-456');
console.log('Paired apps:', apps);
```

**Requirements:** 4.5

---

### `isRunnerOnline(runnerId: string): Promise<boolean>`

Checks if a runner is currently online based on heartbeat.

**Parameters:**
- `runnerId`: The unique identifier of the runner

**Returns:**
- `true` if the runner's last heartbeat was within 30 seconds, `false` otherwise

**Example:**
```typescript
const isOnline = await pairingSessionService.isRunnerOnline('runner-uuid-456');
if (isOnline) {
  console.log('Runner is online');
}
```

**Requirements:** 7.4

---

### `updateHeartbeat(runnerId: string): Promise<void>`

Updates the heartbeat timestamp for a runner.

**Parameters:**
- `runnerId`: The unique identifier of the runner

**Example:**
```typescript
await pairingSessionService.updateHeartbeat('runner-uuid-456');
```

**Note:** This should be called every 10 seconds by the runner.

---

### `removeAllSessionsForRunner(runnerId: string): Promise<string[]>`

Removes all pairing sessions for a specific runner (called when runner disconnects).

**Parameters:**
- `runnerId`: The unique identifier of the runner

**Returns:**
- Array of app session IDs that were unpaired

**Example:**
```typescript
const unpairedApps = await pairingSessionService.removeAllSessionsForRunner('runner-uuid-456');
console.log('Unpaired apps:', unpairedApps);
```

**Requirements:** 4.4

## Heartbeat Mechanism

The service uses a heartbeat mechanism to track runner online status:

1. **Heartbeat Interval**: Runners send heartbeat every 10 seconds
2. **Heartbeat Timeout**: A runner is considered offline if no heartbeat for 30 seconds
3. **Automatic Expiration**: Heartbeat keys have a 60-second TTL in Redis

### Heartbeat Flow

```
Runner                    Broker (PairingSessionService)
  |                              |
  |--- updateHeartbeat() ------->|
  |                              | Set runner:heartbeat:{id} = timestamp
  |                              | Expire in 60 seconds
  |                              |
  | (10 seconds later)           |
  |--- updateHeartbeat() ------->|
  |                              | Update timestamp
  |                              |
  | (If no heartbeat for 30s)    |
  |                              |
  |<-- isRunnerOnline() = false -|
```

## Usage in Gateway

The `PairingSessionService` is typically used in the WebSocket gateway:

```typescript
@WebSocketGateway()
class PairingGateway {
  constructor(
    private readonly pairingSessionService: PairingSessionService,
  ) {}

  @SubscribeMessage('app:pair')
  async handleAppPair(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { pairingCode: string }
  ) {
    // Validate pairing code and get runner ID
    const { runnerId } = await this.validatePairingCode(data.pairingCode);
    
    // Check if runner is online
    const isOnline = await this.pairingSessionService.isRunnerOnline(runnerId);
    if (!isOnline) {
      return { error: 'RUNNER_OFFLINE' };
    }
    
    // Create pairing session
    await this.pairingSessionService.createSession(socket.id, runnerId);
    
    return { success: true, runnerId };
  }

  @SubscribeMessage('runner:heartbeat')
  async handleRunnerHeartbeat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { runnerId: string }
  ) {
    await this.pairingSessionService.updateHeartbeat(data.runnerId);
  }

  @OnDisconnect()
  async handleDisconnect(socket: Socket) {
    // If it's a runner disconnecting
    if (socket.data.type === 'runner') {
      const unpairedApps = await this.pairingSessionService.removeAllSessionsForRunner(
        socket.data.runnerId
      );
      // Notify unpaired apps...
    }
    // If it's an app disconnecting
    else if (socket.data.type === 'app') {
      // Keep the pairing session (allow reconnection)
      // Session will be removed only on explicit unpair
    }
  }
}
```

## Testing

The service includes comprehensive unit tests covering:

- Session creation and retrieval
- Session removal
- Multi-app pairing with one runner
- Runner online status checking
- Heartbeat updates
- Cleanup when runner disconnects

Run tests with:
```bash
pnpm test pairing-session.service.test.ts
```

## Requirements Mapping

- **4.1**: Store pairing relationship (app session_id to runner_id mapping)
- **4.4**: Preserve pairing relationship when app disconnects
- **4.5**: Allow one runner to pair with multiple apps
- **7.1**: Check if app has pairing relationship
- **7.4**: Verify paired runner is still online
- **8.1**: Delete app-runner pairing relationship

## Related Services

- **PairingCodeService**: Manages pairing code registration and validation
- **RateLimitService**: Prevents brute-force pairing attempts
- **PairingHistoryService**: Records pairing events for audit

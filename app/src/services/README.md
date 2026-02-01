# AppClient Service

The `AppClient` class provides a complete client implementation for React Native apps to connect to the broker and pair with runners.

## Features

- **JWT Authentication**: Secure connection to the broker using JWT tokens
- **Pairing Management**: Pair with runners using pairing codes
- **Status Queries**: Check current pairing status and runner availability
- **Automatic Reconnection**: Maintains pairing relationship across network interruptions
- **Error Handling**: User-friendly error messages for all error scenarios
- **Event System**: Subscribe to pairing events and runner status changes

## Requirements

This implementation satisfies the following requirements:
- **3.1**: App pairing request handling
- **7.1**: Pairing status queries
- **8.1**: Unpair functionality
- **9.1, 9.5**: Reconnection with pairing restoration
- **10.1-10.7**: Comprehensive error handling

## Installation

The AppClient uses `socket.io-client` which is already installed in the project:

```bash
npm install socket.io-client
```

## Basic Usage

### 1. Connect to Broker

```typescript
import { AppClient } from './services/app-client';

const appClient = new AppClient();

// Connect with JWT token
await appClient.connect({
  brokerUrl: 'http://your-broker-url:3000',
  jwtToken: 'your-jwt-token',
});
```

### 2. Pair with a Runner

```typescript
try {
  await appClient.pair('ABC-123-XYZ');
  console.log('Paired successfully!');
} catch (error) {
  console.error('Pairing failed:', error.message);
}
```

### 3. Check Pairing Status

```typescript
const status = await appClient.getPairingStatus();
console.log('Paired:', status.isPaired);
console.log('Runner ID:', status.runnerId);
console.log('Runner Online:', status.runnerOnline);
```

### 4. Unpair from Runner

```typescript
await appClient.unpair();
console.log('Unpaired successfully');
```

### 5. Listen to Events

```typescript
// Pairing success
appClient.on('pairing:success', (state) => {
  console.log('Paired with runner:', state.runnerId);
});

// Pairing error
appClient.on('pairing:error', (error) => {
  console.error('Pairing error:', error.message);
  if (error.code === 'RATE_LIMITED') {
    console.log('Retry in:', error.remainingBanTime, 'seconds');
  }
});

// Runner status changes
appClient.on('runner:online', ({ runnerId }) => {
  console.log('Runner came online:', runnerId);
});

appClient.on('runner:offline', ({ runnerId }) => {
  console.log('Runner went offline:', runnerId);
});

// Pairing restored after reconnect
appClient.on('pairing:restored', (state) => {
  console.log('Pairing relationship restored:', state.runnerId);
});
```

### 6. Disconnect

```typescript
appClient.disconnect();
```

## Complete Example

```typescript
import { AppClient, PairingErrorCode } from './services/app-client';

async function main() {
  const appClient = new AppClient();

  // Set up event listeners
  appClient.on('pairing:success', (state) => {
    console.log('✅ Paired with runner:', state.runnerId);
  });

  appClient.on('pairing:error', (error) => {
    console.error('❌ Pairing failed:', error.message);
  });

  appClient.on('runner:online', ({ runnerId }) => {
    console.log('🟢 Runner online:', runnerId);
  });

  appClient.on('runner:offline', ({ runnerId }) => {
    console.log('🔴 Runner offline:', runnerId);
  });

  try {
    // Connect to broker
    await appClient.connect({
      brokerUrl: 'http://localhost:3000',
      jwtToken: 'your-jwt-token',
    });
    console.log('✅ Connected to broker');

    // Pair with runner
    const pairingCode = 'ABC-123-XYZ';
    await appClient.pair(pairingCode);

    // Check status
    const status = await appClient.getPairingStatus();
    console.log('Pairing status:', status);

    // Later, unpair
    // await appClient.unpair();

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
```

## Error Handling

The AppClient provides user-friendly error messages for all error scenarios:

### Pairing Errors

- **INVALID_FORMAT**: Invalid pairing code format
- **CODE_NOT_FOUND**: Pairing code doesn't exist
- **CODE_EXPIRED**: Pairing code has expired
- **RUNNER_OFFLINE**: Runner is not currently online
- **RATE_LIMITED**: Too many failed attempts (includes remaining ban time)

### Connection Errors

- **NETWORK_ERROR**: Network connection issues
- **TIMEOUT**: Request timed out
- **CONNECTION_ERROR**: Failed to connect to broker

### Session Errors

- **SESSION_NOT_FOUND**: Session not found (reconnect required)
- **NOT_PAIRED**: Not currently paired with any runner

## Automatic Reconnection

The AppClient automatically handles reconnection scenarios:

1. **Network Interruptions**: Automatically reconnects with exponential backoff
2. **Pairing Restoration**: Restores pairing relationship after reconnect
3. **Runner Status**: Updates runner online/offline status in real-time

## Event Reference

### Available Events

- `pairing:success` - Pairing completed successfully
- `pairing:error` - Pairing failed
- `pairing:status` - Pairing status received
- `pairing:unpaired` - Unpaired successfully
- `pairing:restored` - Pairing restored after reconnect
- `runner:online` - Runner came online
- `runner:offline` - Runner went offline
- `error` - Generic error occurred

### Event Data Structures

```typescript
// pairing:success, pairing:status, pairing:restored
{
  isPaired: boolean;
  runnerId: string | null;
  runnerOnline: boolean;
  pairedAt: Date | null;
  error: string | null;
}

// pairing:error
{
  code: PairingErrorCode;
  message: string;
  remainingBanTime?: number; // Only for RATE_LIMITED
}

// runner:online, runner:offline
{
  runnerId: string;
}

// error
{
  message: string;
  code?: PairingErrorCode;
}
```

## Integration with React Native

### Using with React Hooks

```typescript
import { useState, useEffect } from 'react';
import { AppClient, PairingState } from './services/app-client';

function usePairing() {
  const [client] = useState(() => new AppClient());
  const [pairingState, setPairingState] = useState<PairingState>({
    isPaired: false,
    runnerId: null,
    runnerOnline: false,
    pairedAt: null,
    error: null,
  });

  useEffect(() => {
    // Set up event listeners
    const handlePairingSuccess = (state: PairingState) => {
      setPairingState(state);
    };

    const handlePairingError = (error: any) => {
      setPairingState(prev => ({ ...prev, error: error.message }));
    };

    client.on('pairing:success', handlePairingSuccess);
    client.on('pairing:error', handlePairingError);

    // Cleanup
    return () => {
      client.off('pairing:success', handlePairingSuccess);
      client.off('pairing:error', handlePairingError);
    };
  }, [client]);

  const connect = async (brokerUrl: string, jwtToken: string) => {
    await client.connect({ brokerUrl, jwtToken });
  };

  const pair = async (pairingCode: string) => {
    await client.pair(pairingCode);
  };

  const unpair = async () => {
    await client.unpair();
  };

  return {
    pairingState,
    connect,
    pair,
    unpair,
  };
}

export default usePairing;
```

## Testing

Unit tests are provided in `__tests__/app-client.test.ts`. To run tests:

```bash
# Install Jest and dependencies (if not already installed)
npm install --save-dev jest @types/jest ts-jest

# Run tests
npm test
```

## Architecture

The AppClient follows the same architecture pattern as the RunnerClient:

1. **Socket.io Connection**: WebSocket connection with automatic reconnection
2. **Event-Driven**: All operations are event-based for real-time updates
3. **State Management**: Maintains pairing state across reconnections
4. **Error Handling**: Comprehensive error handling with user-friendly messages
5. **Exponential Backoff**: Network errors use exponential backoff for retries

## Security Considerations

- JWT tokens are used for authentication
- All communication is over WebSocket (can be upgraded to WSS for production)
- Pairing codes are validated before sending to broker
- Rate limiting is enforced by the broker to prevent brute force attacks

## Performance

- Automatic reconnection with exponential backoff prevents server overload
- Event-driven architecture ensures efficient real-time updates
- Minimal memory footprint with proper cleanup on disconnect

## Troubleshooting

### Connection Issues

If you're having trouble connecting:

1. Check that the broker URL is correct
2. Verify the JWT token is valid
3. Ensure WebSocket connections are allowed (not blocked by firewall)
4. Check network connectivity

### Pairing Issues

If pairing fails:

1. Verify the pairing code format (XXX-XXX-XXX)
2. Check that the runner is online
3. Ensure the pairing code hasn't expired (24 hours)
4. Check if you've been rate limited (too many failed attempts)

### Reconnection Issues

If reconnection fails:

1. Check network connectivity
2. Verify the broker is still running
3. Check console logs for error messages
4. Try manually disconnecting and reconnecting

## License

MIT

# PairingStatus Component

## Overview

The `PairingStatus` component displays the current pairing status between the app and a runner. It provides a visual representation of the pairing relationship, including runner information, online/offline status, and the ability to unpair.

## Features

- **Runner Information Display**: Shows the paired runner's ID
- **Online/Offline Status**: Real-time status indicator with colored badges
- **Pairing Timestamp**: Displays when the pairing was established (e.g., "Just now", "5 minutes ago")
- **Unpair Functionality**: Button to unpair from the current runner with confirmation dialog
- **Offline Warning**: Shows a warning message when the runner is offline
- **Auto-updates**: Automatically updates when runner status changes (online/offline)
- **Event-driven**: Responds to pairing events from the AppClient

## Requirements

This component implements the following requirements:

- **Requirement 7.2**: Display current paired runner
- **Requirement 7.3**: Display runner online status
- **Requirement 8.1**: Provide unpair button

## Usage

### Basic Usage

```tsx
import { PairingStatus } from '../src/components/PairingStatus';
import { AppClient } from '../src/services/app-client';

function MyScreen() {
  const appClient = useRef<AppClient>(new AppClient()).current;

  return (
    <View>
      <PairingStatus appClient={appClient} />
    </View>
  );
}
```

### With Unpair Callback

```tsx
import { PairingStatus } from '../src/components/PairingStatus';
import { AppClient } from '../src/services/app-client';
import { useRouter } from 'expo-router';

function MyScreen() {
  const router = useRouter();
  const appClient = useRef<AppClient>(new AppClient()).current;

  const handleUnpaired = () => {
    // Navigate to pairing screen after unpair
    router.push('/pairing');
  };

  return (
    <View>
      <PairingStatus 
        appClient={appClient} 
        onUnpaired={handleUnpaired}
      />
    </View>
  );
}
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `appClient` | `AppClient` | Yes | AppClient instance for managing pairing |
| `onUnpaired` | `() => void` | No | Callback function called when unpair is successful |

## Component Behavior

### Rendering

- **Not Paired**: The component returns `null` and doesn't render anything
- **Paired**: The component displays the pairing information

### Status Indicators

- **Online**: Green badge with "Online" text
- **Offline**: Red badge with "Offline" text + warning message

### Timestamp Formatting

The component automatically formats the pairing timestamp:

- Less than 1 minute: "Just now"
- 1-59 minutes: "X minute(s) ago"
- 1-23 hours: "X hour(s) ago"
- 24+ hours: "X day(s) ago"
- No timestamp: "Unknown"

### Unpair Flow

1. User presses "Unpair" button
2. Confirmation dialog appears
3. If confirmed:
   - Calls `appClient.unpair()`
   - Shows loading indicator
   - On success: Calls `onUnpaired` callback
   - On error: Shows error alert

## Events

The component listens to the following AppClient events:

- `pairing:status`: Updates pairing state
- `pairing:restored`: Updates pairing state after reconnection
- `runner:online`: Updates runner status to online
- `runner:offline`: Updates runner status to offline
- `pairing:unpaired`: Handles successful unpair

## Styling

The component uses a dark theme consistent with the app's design:

- Background: `#313244` (dark gray)
- Text: `#cdd6f4` (light gray)
- Online badge: `#a6e3a1` (green)
- Offline badge: `#f38ba8` (red)
- Unpair button: `#f38ba8` (red)
- Warning: `#fab387` (orange)

## Testing

The component includes comprehensive tests covering:

- Rendering in different states (paired/not paired, online/offline)
- Runner status updates
- Unpair functionality
- Timestamp formatting
- Event listener cleanup
- Requirements validation

Run tests with:

```bash
npm test -- PairingStatus.test.tsx
```

## Examples

See `PairingStatus.example.tsx` for complete usage examples, including:

- Basic usage
- Usage in a terminal screen
- Conditional rendering based on pairing state

## Implementation Notes

### State Management

The component maintains two pieces of local state:

1. `pairingState`: The current pairing state (synced with AppClient)
2. `isUnpairing`: Loading state for the unpair operation

### Event Listener Cleanup

The component properly cleans up event listeners on unmount to prevent memory leaks.

### Error Handling

- Network errors during unpair are caught and displayed to the user
- Failed unpair operations show an error alert with the error message

### Accessibility

- Uses TouchableOpacity for better touch feedback
- Provides visual feedback for disabled states
- Uses semantic colors for status indicators

## Related Components

- `PairingScreen`: Component for entering pairing codes
- `AppClient`: Service for managing app-broker communication

## Related Files

- `app/src/components/PairingStatus.tsx`: Component implementation
- `app/src/components/__tests__/PairingStatus.test.tsx`: Component tests
- `app/src/components/PairingStatus.example.tsx`: Usage examples
- `app/src/services/app-client.ts`: AppClient service

## Future Enhancements

Potential improvements for future versions:

1. **Refresh Button**: Manual refresh of pairing status
2. **Runner Details**: Show more runner information (hostname, IP, etc.)
3. **Connection Quality**: Display connection quality indicator
4. **Pairing History**: Show previous pairings
5. **Multiple Runners**: Support for pairing with multiple runners
6. **Customizable Styling**: Allow custom colors and styles via props

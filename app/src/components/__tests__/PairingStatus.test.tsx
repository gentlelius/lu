import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { PairingStatus } from '../PairingStatus';
import { AppClient, PairingState } from '../../services/app-client';

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock AppClient
jest.mock('../../services/app-client');

describe('PairingStatus Component', () => {
  let mockAppClient: jest.Mocked<AppClient>;
  let eventListeners: Map<string, Set<(data: any) => void>>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create event listeners map
    eventListeners = new Map();

    // Create mock AppClient
    mockAppClient = {
      getCurrentPairingState: jest.fn(),
      getPairingStatus: jest.fn().mockResolvedValue({
        isPaired: false,
        runnerId: null,
        runnerOnline: false,
        pairedAt: null,
        error: null,
      }),
      unpair: jest.fn(),
      isAppConnected: jest.fn(),
      on: jest.fn((event: string, callback: (data: any) => void) => {
        if (!eventListeners.has(event)) {
          eventListeners.set(event, new Set());
        }
        eventListeners.get(event)?.add(callback);
      }),
      off: jest.fn((event: string, callback: (data: any) => void) => {
        eventListeners.get(event)?.delete(callback);
      }),
    } as any;
  });

  /**
   * Helper function to emit events to listeners
   */
  const emitEvent = (event: string, data: any) => {
    eventListeners.get(event)?.forEach((callback) => callback(data));
  };

  describe('Rendering', () => {
    it('should not render when not paired', () => {
      const notPairedState: PairingState = {
        isPaired: false,
        runnerId: null,
        runnerOnline: false,
        pairedAt: null,
        error: null,
      };

      mockAppClient.getCurrentPairingState.mockReturnValue(notPairedState);
      mockAppClient.isAppConnected.mockReturnValue(true);

      const { queryByText } = render(
        <PairingStatus appClient={mockAppClient} />
      );

      expect(queryByText('Paired Runner')).toBeNull();
    });

    it('should render when paired with online runner', () => {
      const pairedState: PairingState = {
        isPaired: true,
        runnerId: 'test-runner-123',
        runnerOnline: true,
        pairedAt: new Date(),
        error: null,
      };

      mockAppClient.getCurrentPairingState.mockReturnValue(pairedState);
      mockAppClient.isAppConnected.mockReturnValue(true);

      const { getByText } = render(
        <PairingStatus appClient={mockAppClient} />
      );

      expect(getByText('Paired Runner')).toBeTruthy();
      expect(getByText('Online')).toBeTruthy();
      expect(getByText('test-runner-123')).toBeTruthy();
      expect(getByText('Unpair')).toBeTruthy();
    });

    it('should render when paired with offline runner', () => {
      const pairedState: PairingState = {
        isPaired: true,
        runnerId: 'test-runner-456',
        runnerOnline: false,
        pairedAt: new Date(Date.now() - 3600000), // 1 hour ago
        error: null,
      };

      mockAppClient.getCurrentPairingState.mockReturnValue(pairedState);
      mockAppClient.isAppConnected.mockReturnValue(true);

      const { getByText } = render(
        <PairingStatus appClient={mockAppClient} />
      );

      expect(getByText('Paired Runner')).toBeTruthy();
      expect(getByText('Offline')).toBeTruthy();
      expect(getByText('test-runner-456')).toBeTruthy();
      expect(getByText(/runner is currently offline/i)).toBeTruthy();
    });
  });

  describe('Runner Status Updates', () => {
    it('should update status when runner comes online', async () => {
      const pairedState: PairingState = {
        isPaired: true,
        runnerId: 'test-runner-123',
        runnerOnline: false,
        pairedAt: new Date(),
        error: null,
      };

      mockAppClient.getCurrentPairingState.mockReturnValue(pairedState);
      mockAppClient.isAppConnected.mockReturnValue(true);

      const { getByText, queryByText } = render(
        <PairingStatus appClient={mockAppClient} />
      );

      // Initially offline
      expect(getByText('Offline')).toBeTruthy();
      expect(getByText(/runner is currently offline/i)).toBeTruthy();

      // Emit runner:online event
      emitEvent('runner:online', { runnerId: 'test-runner-123' });

      // Should now show online
      await waitFor(() => {
        expect(getByText('Online')).toBeTruthy();
        expect(queryByText(/runner is currently offline/i)).toBeNull();
      });
    });

    it('should update status when runner goes offline', async () => {
      const pairedState: PairingState = {
        isPaired: true,
        runnerId: 'test-runner-123',
        runnerOnline: true,
        pairedAt: new Date(),
        error: null,
      };

      mockAppClient.getCurrentPairingState.mockReturnValue(pairedState);
      mockAppClient.isAppConnected.mockReturnValue(true);

      const { getByText, queryByText } = render(
        <PairingStatus appClient={mockAppClient} />
      );

      // Initially online
      expect(getByText('Online')).toBeTruthy();
      expect(queryByText(/runner is currently offline/i)).toBeNull();

      // Emit runner:offline event
      emitEvent('runner:offline', { runnerId: 'test-runner-123' });

      // Should now show offline
      await waitFor(() => {
        expect(getByText('Offline')).toBeTruthy();
        expect(getByText(/runner is currently offline/i)).toBeTruthy();
      });
    });
  });

  describe('Unpair Functionality', () => {
    it('should show confirmation dialog when unpair button is pressed', () => {
      const pairedState: PairingState = {
        isPaired: true,
        runnerId: 'test-runner-123',
        runnerOnline: true,
        pairedAt: new Date(),
        error: null,
      };

      mockAppClient.getCurrentPairingState.mockReturnValue(pairedState);
      mockAppClient.isAppConnected.mockReturnValue(true);

      const { getByText } = render(
        <PairingStatus appClient={mockAppClient} />
      );

      const unpairButton = getByText('Unpair');
      fireEvent.press(unpairButton);

      expect(Alert.alert).toHaveBeenCalledWith(
        'Unpair from Runner',
        expect.stringContaining('test-runner-123'),
        expect.any(Array)
      );
    });

    it('should call unpair when confirmed', async () => {
      const pairedState: PairingState = {
        isPaired: true,
        runnerId: 'test-runner-123',
        runnerOnline: true,
        pairedAt: new Date(),
        error: null,
      };

      mockAppClient.getCurrentPairingState.mockReturnValue(pairedState);
      mockAppClient.isAppConnected.mockReturnValue(true);
      mockAppClient.unpair.mockResolvedValue();

      const onUnpaired = jest.fn();

      const { getByText } = render(
        <PairingStatus appClient={mockAppClient} onUnpaired={onUnpaired} />
      );

      const unpairButton = getByText('Unpair');
      fireEvent.press(unpairButton);

      // Get the confirm button from Alert.alert mock
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const buttons = alertCall[2];
      const confirmButton = buttons.find((b: any) => b.text === 'Unpair');

      // Simulate pressing confirm
      await confirmButton.onPress();

      expect(mockAppClient.unpair).toHaveBeenCalled();
    });

    it('should call onUnpaired callback when unpair succeeds', async () => {
      const pairedState: PairingState = {
        isPaired: true,
        runnerId: 'test-runner-123',
        runnerOnline: true,
        pairedAt: new Date(),
        error: null,
      };

      mockAppClient.getCurrentPairingState.mockReturnValue(pairedState);
      mockAppClient.isAppConnected.mockReturnValue(true);
      mockAppClient.unpair.mockResolvedValue();

      const onUnpaired = jest.fn();

      const { getByText } = render(
        <PairingStatus appClient={mockAppClient} onUnpaired={onUnpaired} />
      );

      const unpairButton = getByText('Unpair');
      fireEvent.press(unpairButton);

      // Get the confirm button from Alert.alert mock
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const buttons = alertCall[2];
      const confirmButton = buttons.find((b: any) => b.text === 'Unpair');

      // Simulate pressing confirm
      await confirmButton.onPress();

      // Emit unpaired event
      emitEvent('pairing:unpaired', {
        isPaired: false,
        runnerId: null,
        runnerOnline: false,
        pairedAt: null,
        error: null,
      });

      await waitFor(() => {
        expect(onUnpaired).toHaveBeenCalled();
      });
    });

    it('should show error alert when unpair fails', async () => {
      const pairedState: PairingState = {
        isPaired: true,
        runnerId: 'test-runner-123',
        runnerOnline: true,
        pairedAt: new Date(),
        error: null,
      };

      mockAppClient.getCurrentPairingState.mockReturnValue(pairedState);
      mockAppClient.isAppConnected.mockReturnValue(true);
      mockAppClient.unpair.mockRejectedValue(new Error('Network error'));

      const { getByText } = render(
        <PairingStatus appClient={mockAppClient} />
      );

      const unpairButton = getByText('Unpair');
      fireEvent.press(unpairButton);

      // Get the confirm button from Alert.alert mock
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const buttons = alertCall[2];
      const confirmButton = buttons.find((b: any) => b.text === 'Unpair');

      // Simulate pressing confirm
      await confirmButton.onPress();

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Unpair Failed',
          'Network error',
          expect.any(Array)
        );
      });
    });
  });

  describe('Timestamp Formatting', () => {
    it('should format "Just now" for recent pairing', () => {
      const pairedState: PairingState = {
        isPaired: true,
        runnerId: 'test-runner-123',
        runnerOnline: true,
        pairedAt: new Date(),
        error: null,
      };

      mockAppClient.getCurrentPairingState.mockReturnValue(pairedState);
      mockAppClient.isAppConnected.mockReturnValue(true);

      const { getByText } = render(
        <PairingStatus appClient={mockAppClient} />
      );

      expect(getByText('Just now')).toBeTruthy();
    });

    it('should format minutes ago', () => {
      const pairedState: PairingState = {
        isPaired: true,
        runnerId: 'test-runner-123',
        runnerOnline: true,
        pairedAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        error: null,
      };

      mockAppClient.getCurrentPairingState.mockReturnValue(pairedState);
      mockAppClient.isAppConnected.mockReturnValue(true);

      const { getByText } = render(
        <PairingStatus appClient={mockAppClient} />
      );

      expect(getByText('5 minutes ago')).toBeTruthy();
    });

    it('should format hours ago', () => {
      const pairedState: PairingState = {
        isPaired: true,
        runnerId: 'test-runner-123',
        runnerOnline: true,
        pairedAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
        error: null,
      };

      mockAppClient.getCurrentPairingState.mockReturnValue(pairedState);
      mockAppClient.isAppConnected.mockReturnValue(true);

      const { getByText } = render(
        <PairingStatus appClient={mockAppClient} />
      );

      expect(getByText('3 hours ago')).toBeTruthy();
    });

    it('should format days ago', () => {
      const pairedState: PairingState = {
        isPaired: true,
        runnerId: 'test-runner-123',
        runnerOnline: true,
        pairedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        error: null,
      };

      mockAppClient.getCurrentPairingState.mockReturnValue(pairedState);
      mockAppClient.isAppConnected.mockReturnValue(true);

      const { getByText } = render(
        <PairingStatus appClient={mockAppClient} />
      );

      expect(getByText('2 days ago')).toBeTruthy();
    });

    it('should show "Unknown" for null pairedAt', () => {
      const pairedState: PairingState = {
        isPaired: true,
        runnerId: 'test-runner-123',
        runnerOnline: true,
        pairedAt: null,
        error: null,
      };

      mockAppClient.getCurrentPairingState.mockReturnValue(pairedState);
      mockAppClient.isAppConnected.mockReturnValue(true);

      const { getByText } = render(
        <PairingStatus appClient={mockAppClient} />
      );

      expect(getByText('Unknown')).toBeTruthy();
    });
  });

  describe('Event Listener Cleanup', () => {
    it('should unregister event listeners on unmount', () => {
      const pairedState: PairingState = {
        isPaired: true,
        runnerId: 'test-runner-123',
        runnerOnline: true,
        pairedAt: new Date(),
        error: null,
      };

      mockAppClient.getCurrentPairingState.mockReturnValue(pairedState);
      mockAppClient.isAppConnected.mockReturnValue(true);

      const { unmount } = render(
        <PairingStatus appClient={mockAppClient} />
      );

      // Clear the mock calls from mount
      mockAppClient.off.mockClear();

      unmount();

      // Should have called off for each event listener
      expect(mockAppClient.off).toHaveBeenCalledWith('pairing:status', expect.any(Function));
      expect(mockAppClient.off).toHaveBeenCalledWith('pairing:restored', expect.any(Function));
      expect(mockAppClient.off).toHaveBeenCalledWith('runner:online', expect.any(Function));
      expect(mockAppClient.off).toHaveBeenCalledWith('runner:offline', expect.any(Function));
      expect(mockAppClient.off).toHaveBeenCalledWith('pairing:unpaired', expect.any(Function));
    });
  });

  describe('Requirements Validation', () => {
    it('should display current paired runner (Requirement 7.2)', () => {
      const pairedState: PairingState = {
        isPaired: true,
        runnerId: 'test-runner-abc-123',
        runnerOnline: true,
        pairedAt: new Date(),
        error: null,
      };

      mockAppClient.getCurrentPairingState.mockReturnValue(pairedState);
      mockAppClient.isAppConnected.mockReturnValue(true);

      const { getByText } = render(
        <PairingStatus appClient={mockAppClient} />
      );

      expect(getByText('test-runner-abc-123')).toBeTruthy();
    });

    it('should display runner online status (Requirement 7.3)', async () => {
      const onlineState: PairingState = {
        isPaired: true,
        runnerId: 'test-runner-123',
        runnerOnline: true,
        pairedAt: new Date(),
        error: null,
      };

      mockAppClient.getCurrentPairingState.mockReturnValue(onlineState);
      mockAppClient.isAppConnected.mockReturnValue(true);

      const { getByText } = render(
        <PairingStatus appClient={mockAppClient} />
      );

      expect(getByText('Online')).toBeTruthy();

      // Emit runner:offline event to trigger state update
      emitEvent('runner:offline', { runnerId: 'test-runner-123' });

      // Should now show offline
      await waitFor(() => {
        expect(getByText('Offline')).toBeTruthy();
      });
    });

    it('should provide unpair button (Requirement 8.1)', () => {
      const pairedState: PairingState = {
        isPaired: true,
        runnerId: 'test-runner-123',
        runnerOnline: true,
        pairedAt: new Date(),
        error: null,
      };

      mockAppClient.getCurrentPairingState.mockReturnValue(pairedState);
      mockAppClient.isAppConnected.mockReturnValue(true);

      const { getByText } = render(
        <PairingStatus appClient={mockAppClient} />
      );

      const unpairButton = getByText('Unpair');
      expect(unpairButton).toBeTruthy();

      // Verify button is functional
      fireEvent.press(unpairButton);
      expect(Alert.alert).toHaveBeenCalled();
    });
  });
});

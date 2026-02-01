import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { AppClient, PairingState } from '../services/app-client';

/**
 * PairingStatus Component Props
 */
interface PairingStatusProps {
  /** AppClient instance for managing pairing */
  appClient: AppClient;
  /** Callback when unpair is successful */
  onUnpaired?: () => void;
}

/**
 * PairingStatus Component
 * 
 * Displays the current pairing status with a runner, including:
 * - Runner ID
 * - Runner online/offline status
 * - Pairing timestamp
 * - Unpair button
 * 
 * This component automatically updates when the runner status changes
 * (online/offline) and provides a way to unpair from the current runner.
 * 
 * Requirements: 7.2, 7.3, 8.1
 * 
 * @example
 * ```tsx
 * <PairingStatus 
 *   appClient={appClient} 
 *   onUnpaired={() => router.push('/pairing')}
 * />
 * ```
 */
export function PairingStatus({ appClient, onUnpaired }: PairingStatusProps) {
  const [pairingState, setPairingState] = useState<PairingState>(
    appClient.getCurrentPairingState()
  );
  const [isUnpairing, setIsUnpairing] = useState(false);

  useEffect(() => {
    // Update pairing state when it changes
    const handlePairingStatus = (state: PairingState) => {
      setPairingState(state);
    };

    const handleRunnerOnline = () => {
      setPairingState((prev) => ({ ...prev, runnerOnline: true }));
    };

    const handleRunnerOffline = () => {
      setPairingState((prev) => ({ ...prev, runnerOnline: false }));
    };

    const handleUnpaired = () => {
      setPairingState({
        isPaired: false,
        runnerId: null,
        runnerOnline: false,
        pairedAt: null,
        error: null,
      });
      setIsUnpairing(false);
      onUnpaired?.();
    };

    // Register event listeners
    appClient.on('pairing:status', handlePairingStatus);
    appClient.on('pairing:restored', handlePairingStatus);
    appClient.on('runner:online', handleRunnerOnline);
    appClient.on('runner:offline', handleRunnerOffline);
    appClient.on('pairing:unpaired', handleUnpaired);

    // Query current status on mount
    if (appClient.isAppConnected()) {
      appClient.getPairingStatus().catch((error) => {
        console.error('Failed to get pairing status:', error);
      });
    }

    // Cleanup
    return () => {
      appClient.off('pairing:status', handlePairingStatus);
      appClient.off('pairing:restored', handlePairingStatus);
      appClient.off('runner:online', handleRunnerOnline);
      appClient.off('runner:offline', handleRunnerOffline);
      appClient.off('pairing:unpaired', handleUnpaired);
    };
  }, [appClient, onUnpaired]);

  /**
   * Handle unpair button press
   * Shows a confirmation dialog before unpairing
   */
  const handleUnpair = () => {
    Alert.alert(
      'Unpair from Runner',
      `Are you sure you want to unpair from runner ${pairingState.runnerId}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Unpair',
          style: 'destructive',
          onPress: async () => {
            setIsUnpairing(true);
            try {
              await appClient.unpair();
              // Success is handled by the event listener
            } catch (error) {
              console.error('Failed to unpair:', error);
              Alert.alert(
                'Unpair Failed',
                error instanceof Error ? error.message : 'An unexpected error occurred',
                [{ text: 'OK' }]
              );
              setIsUnpairing(false);
            }
          },
        },
      ]
    );
  };

  /**
   * Format the pairing timestamp
   */
  const formatPairedAt = (date: Date | null): string => {
    if (!date) return 'Unknown';
    
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  };

  // Don't render if not paired
  if (!pairingState.isPaired || !pairingState.runnerId) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Paired Runner</Text>
        <View style={[
          styles.statusBadge,
          pairingState.runnerOnline ? styles.statusOnline : styles.statusOffline,
        ]}>
          <View style={[
            styles.statusDot,
            pairingState.runnerOnline ? styles.dotOnline : styles.dotOffline,
          ]} />
          <Text style={styles.statusText}>
            {pairingState.runnerOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>

      {/* Runner Information */}
      <View style={styles.infoContainer}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Runner ID:</Text>
          <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">
            {pairingState.runnerId}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Paired:</Text>
          <Text style={styles.infoValue}>
            {formatPairedAt(pairingState.pairedAt)}
          </Text>
        </View>
      </View>

      {/* Unpair Button */}
      <TouchableOpacity
        style={[styles.unpairButton, isUnpairing && styles.unpairButtonDisabled]}
        onPress={handleUnpair}
        disabled={isUnpairing}
      >
        {isUnpairing ? (
          <ActivityIndicator size="small" color="#1e1e2e" />
        ) : (
          <Text style={styles.unpairButtonText}>Unpair</Text>
        )}
      </TouchableOpacity>

      {/* Offline Warning */}
      {!pairingState.runnerOnline && (
        <View style={styles.warningContainer}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={styles.warningText}>
            The runner is currently offline. You won't be able to send commands until it comes back online.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#313244',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#45475a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#cdd6f4',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusOnline: {
    backgroundColor: '#a6e3a1',
  },
  statusOffline: {
    backgroundColor: '#f38ba8',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  dotOnline: {
    backgroundColor: '#40a02b',
  },
  dotOffline: {
    backgroundColor: '#d20f39',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e1e2e',
  },
  infoContainer: {
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#a6adc8',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: '#cdd6f4',
    fontWeight: '400',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  unpairButton: {
    backgroundColor: '#f38ba8',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  unpairButtonDisabled: {
    opacity: 0.5,
  },
  unpairButtonText: {
    color: '#1e1e2e',
    fontSize: 16,
    fontWeight: '600',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fab387',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  warningIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#1e1e2e',
    fontWeight: '500',
  },
});

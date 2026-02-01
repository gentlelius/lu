/**
 * Example usage of AppClient in a React Native component
 * 
 * This file demonstrates how to integrate the AppClient into a React Native
 * application with proper state management and error handling.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { AppClient, PairingState, PairingErrorCode } from './app-client';

/**
 * Custom hook for managing AppClient
 */
function useAppClient() {
  const [client] = useState(() => new AppClient());
  const [isConnected, setIsConnected] = useState(false);
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
      Alert.alert('Success', `Paired with runner: ${state.runnerId}`);
    };

    const handlePairingError = (error: { code: PairingErrorCode; message: string; remainingBanTime?: number }) => {
      setPairingState(prev => ({ ...prev, error: error.message }));
      Alert.alert('Pairing Failed', error.message);
    };

    const handlePairingStatus = (state: PairingState) => {
      setPairingState(state);
    };

    const handleUnpaired = (state: PairingState) => {
      setPairingState(state);
      Alert.alert('Success', 'Unpaired successfully');
    };

    const handlePairingRestored = (state: PairingState) => {
      setPairingState(state);
      Alert.alert('Reconnected', `Pairing restored with runner: ${state.runnerId}`);
    };

    const handleRunnerOnline = ({ runnerId }: { runnerId: string }) => {
      if (pairingState.runnerId === runnerId) {
        setPairingState(prev => ({ ...prev, runnerOnline: true }));
        Alert.alert('Runner Online', `Runner ${runnerId} is now online`);
      }
    };

    const handleRunnerOffline = ({ runnerId }: { runnerId: string }) => {
      if (pairingState.runnerId === runnerId) {
        setPairingState(prev => ({ ...prev, runnerOnline: false }));
        Alert.alert('Runner Offline', `Runner ${runnerId} is now offline`);
      }
    };

    const handleError = ({ message }: { message: string }) => {
      Alert.alert('Error', message);
    };

    // Register event listeners
    client.on('pairing:success', handlePairingSuccess);
    client.on('pairing:error', handlePairingError);
    client.on('pairing:status', handlePairingStatus);
    client.on('pairing:unpaired', handleUnpaired);
    client.on('pairing:restored', handlePairingRestored);
    client.on('runner:online', handleRunnerOnline);
    client.on('runner:offline', handleRunnerOffline);
    client.on('error', handleError);

    // Cleanup on unmount
    return () => {
      client.off('pairing:success', handlePairingSuccess);
      client.off('pairing:error', handlePairingError);
      client.off('pairing:status', handlePairingStatus);
      client.off('pairing:unpaired', handleUnpaired);
      client.off('pairing:restored', handlePairingRestored);
      client.off('runner:online', handleRunnerOnline);
      client.off('runner:offline', handleRunnerOffline);
      client.off('error', handleError);
      client.disconnect();
    };
  }, [client, pairingState.runnerId]);

  const connect = async (brokerUrl: string, jwtToken: string) => {
    try {
      await client.connect({ brokerUrl, jwtToken });
      setIsConnected(true);
      return true;
    } catch (error: any) {
      Alert.alert('Connection Failed', error.message);
      return false;
    }
  };

  const pair = async (pairingCode: string) => {
    try {
      await client.pair(pairingCode);
      return true;
    } catch (error: any) {
      // Error is already handled by event listener
      return false;
    }
  };

  const unpair = async () => {
    try {
      await client.unpair();
      return true;
    } catch (error: any) {
      Alert.alert('Unpair Failed', error.message);
      return false;
    }
  };

  const checkStatus = async () => {
    try {
      const status = await client.getPairingStatus();
      return status;
    } catch (error: any) {
      Alert.alert('Status Check Failed', error.message);
      return null;
    }
  };

  return {
    isConnected,
    pairingState,
    connect,
    pair,
    unpair,
    checkStatus,
  };
}

/**
 * Example Pairing Screen Component
 */
export function PairingScreen() {
  const { isConnected, pairingState, connect, pair, unpair, checkStatus } = useAppClient();
  const [brokerUrl, setBrokerUrl] = useState('http://115.191.40.55:3000');
  const [jwtToken, setJwtToken] = useState('your-jwt-token');
  const [pairingCode, setPairingCode] = useState('');

  // Auto-connect on mount
  useEffect(() => {
    if (!isConnected) {
      connect(brokerUrl, jwtToken);
    }
  }, []);

  const handleConnect = async () => {
    await connect(brokerUrl, jwtToken);
  };

  const handlePair = async () => {
    if (!pairingCode) {
      Alert.alert('Error', 'Please enter a pairing code');
      return;
    }
    await pair(pairingCode);
  };

  const handleUnpair = async () => {
    await unpair();
  };

  const handleCheckStatus = async () => {
    const status = await checkStatus();
    if (status) {
      Alert.alert(
        'Pairing Status',
        `Paired: ${status.isPaired}\n` +
        `Runner ID: ${status.runnerId || 'N/A'}\n` +
        `Runner Online: ${status.runnerOnline}\n` +
        `Paired At: ${status.pairedAt?.toLocaleString() || 'N/A'}`
      );
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Runner Pairing</Text>

      {/* Connection Status */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusLabel}>Connection Status:</Text>
        <Text style={[styles.statusValue, isConnected ? styles.online : styles.offline]}>
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </Text>
      </View>

      {/* Pairing Status */}
      {pairingState.isPaired && (
        <View style={styles.statusContainer}>
          <Text style={styles.statusLabel}>Paired with:</Text>
          <Text style={styles.statusValue}>{pairingState.runnerId}</Text>
          <Text style={[styles.statusValue, pairingState.runnerOnline ? styles.online : styles.offline]}>
            {pairingState.runnerOnline ? '🟢 Online' : '🔴 Offline'}
          </Text>
        </View>
      )}

      {/* Error Display */}
      {pairingState.error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{pairingState.error}</Text>
        </View>
      )}

      {/* Connection Section */}
      {!isConnected && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connect to Broker</Text>
          <TextInput
            style={styles.input}
            placeholder="Broker URL"
            value={brokerUrl}
            onChangeText={setBrokerUrl}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="JWT Token"
            value={jwtToken}
            onChangeText={setJwtToken}
            autoCapitalize="none"
            secureTextEntry
          />
          <Button title="Connect" onPress={handleConnect} />
        </View>
      )}

      {/* Pairing Section */}
      {isConnected && !pairingState.isPaired && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Enter Pairing Code</Text>
          <TextInput
            style={styles.input}
            placeholder="XXX-XXX-XXX"
            value={pairingCode}
            onChangeText={(text) => setPairingCode(text.toUpperCase())}
            autoCapitalize="characters"
            maxLength={11}
          />
          <Button title="Pair" onPress={handlePair} disabled={!pairingCode} />
        </View>
      )}

      {/* Paired Actions */}
      {isConnected && pairingState.isPaired && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Paired Actions</Text>
          <View style={styles.buttonContainer}>
            <Button title="Check Status" onPress={handleCheckStatus} />
          </View>
          <View style={styles.buttonContainer}>
            <Button title="Unpair" onPress={handleUnpair} color="red" />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  statusContainer: {
    marginBottom: 15,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 5,
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  online: {
    color: '#4CAF50',
  },
  offline: {
    color: '#F44336',
  },
  errorContainer: {
    marginBottom: 15,
    padding: 10,
    backgroundColor: '#FFEBEE',
    borderRadius: 5,
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  errorText: {
    color: '#C62828',
    fontSize: 14,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
    fontSize: 16,
  },
  buttonContainer: {
    marginBottom: 10,
  },
});

/**
 * Simpler example for quick integration
 */
export async function quickPairingExample() {
  const client = new AppClient();

  try {
    // 1. Connect to broker
    await client.connect({
      brokerUrl: 'http://115.191.40.55:3000',
      jwtToken: 'your-jwt-token',
    });
    console.log('✅ Connected to broker');

    // 2. Set up event listeners
    client.on('pairing:success', (state) => {
      console.log('✅ Paired with runner:', state.runnerId);
    });

    client.on('pairing:error', (error) => {
      console.error('❌ Pairing failed:', error.message);
    });

    // 3. Pair with runner
    await client.pair('ABC-123-XYZ');

    // 4. Check status
    const status = await client.getPairingStatus();
    console.log('Pairing status:', status);

    // 5. Later, unpair
    // await client.unpair();

  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

import React, { useRef } from 'react';
import { View, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import { PairingStatus } from './PairingStatus';
import { AppClient } from '../services/app-client';
import { useRouter } from 'expo-router';

/**
 * Example: Using PairingStatus Component
 * 
 * This example demonstrates how to integrate the PairingStatus component
 * into your React Native application.
 * 
 * The PairingStatus component displays the current pairing status with a runner,
 * including the runner ID, online/offline status, and provides an unpair button.
 * 
 * Requirements: 7.2, 7.3, 8.1
 */
export default function PairingStatusExample() {
  const router = useRouter();
  const appClient = useRef<AppClient>(new AppClient()).current;

  /**
   * Handle unpair callback
   * Navigate back to pairing screen when unpaired
   */
  const handleUnpaired = () => {
    console.log('Unpaired from runner, navigating to pairing screen...');
    router.push('/pairing');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />

      <View style={styles.content}>
        {/* 
          PairingStatus Component
          
          Props:
          - appClient: AppClient instance for managing pairing
          - onUnpaired: Optional callback when unpair is successful
          
          The component will:
          - Display the current paired runner ID
          - Show runner online/offline status with a colored badge
          - Display when the pairing was established
          - Provide an unpair button with confirmation dialog
          - Show a warning when the runner is offline
          - Automatically update when runner status changes
        */}
        <PairingStatus 
          appClient={appClient} 
          onUnpaired={handleUnpaired}
        />

        {/* Your other app content goes here */}
      </View>
    </SafeAreaView>
  );
}

/**
 * Example: Using PairingStatus in a Terminal Screen
 * 
 * This example shows how to use PairingStatus alongside other components
 * in a terminal screen.
 */
export function TerminalScreenWithPairingStatus() {
  const router = useRouter();
  const appClient = useRef<AppClient>(new AppClient()).current;

  const handleUnpaired = () => {
    router.replace('/pairing');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />

      <View style={styles.content}>
        {/* Show pairing status at the top */}
        <PairingStatus 
          appClient={appClient} 
          onUnpaired={handleUnpaired}
        />

        {/* Terminal or other content below */}
        <View style={styles.terminalContainer}>
          {/* Your terminal component here */}
        </View>
      </View>
    </SafeAreaView>
  );
}

/**
 * Example: Conditional Rendering Based on Pairing State
 * 
 * This example shows how to conditionally render content based on
 * whether the app is paired with a runner.
 */
export function ConditionalPairingExample() {
  const router = useRouter();
  const appClient = useRef<AppClient>(new AppClient()).current;
  const pairingState = appClient.getCurrentPairingState();

  const handleUnpaired = () => {
    router.replace('/pairing');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />

      <View style={styles.content}>
        {pairingState.isPaired ? (
          <>
            {/* Show pairing status when paired */}
            <PairingStatus 
              appClient={appClient} 
              onUnpaired={handleUnpaired}
            />
            
            {/* Show terminal or other paired content */}
            <View style={styles.terminalContainer}>
              {/* Your terminal component here */}
            </View>
          </>
        ) : (
          <>
            {/* Show pairing screen when not paired */}
            {/* Your pairing screen component here */}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  terminalContainer: {
    flex: 1,
    marginTop: 16,
    backgroundColor: '#313244',
    borderRadius: 12,
    padding: 16,
  },
});

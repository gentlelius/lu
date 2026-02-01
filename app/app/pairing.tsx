import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { AppClient, PairingErrorCode, PairingState } from '../src/services/app-client';
import { useRouter } from 'expo-router';

/**
 * PairingScreen Component
 * 
 * Provides a user interface for pairing the app with a runner using a pairing code.
 * 
 * Features:
 * - Three input fields for the 9-character pairing code (XXX-XXX-XXX format)
 * - Automatic formatting with hyphens
 * - Auto-focus on next input field
 * - Submit button to initiate pairing
 * - Display of pairing status and error messages
 * - Integration with AppClient for pairing functionality
 * 
 * Requirements: 3.1, 10.1, 10.2, 10.3, 10.4, 10.5
 */
export default function PairingScreen() {
  const router = useRouter();
  const appClient = useRef<AppClient>(new AppClient()).current;

  // Pairing code state - three groups of 3 characters each
  const [code1, setCode1] = useState('');
  const [code2, setCode2] = useState('');
  const [code3, setCode3] = useState('');

  // UI state
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPairing, setIsPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairingState, setPairingState] = useState<PairingState | null>(null);

  // Input refs for auto-focus
  const input1Ref = useRef<TextInput>(null);
  const input2Ref = useRef<TextInput>(null);
  const input3Ref = useRef<TextInput>(null);

  // Connect to broker on mount
  useEffect(() => {
    connectToBroker();

    // Set up event listeners
    appClient.on('pairing:success', handlePairingSuccess);
    appClient.on('pairing:error', handlePairingError);

    return () => {
      appClient.off('pairing:success', handlePairingSuccess);
      appClient.off('pairing:error', handlePairingError);
      appClient.disconnect();
    };
  }, []);

  /**
   * Connect to the broker
   */
  const connectToBroker = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      // TODO: Replace with actual JWT token from authentication
      const config = {
        brokerUrl: 'http://localhost:3000', // TODO: Use environment variable
        jwtToken: 'demo-token',
      };

      await appClient.connect(config);
      console.log('✅ Connected to broker');
      setIsConnecting(false);
    } catch (err) {
      console.error('❌ Failed to connect to broker:', err);
      setError('Failed to connect to broker. Please check your connection.');
      setIsConnecting(false);
    }
  };

  /**
   * Handle pairing success
   */
  const handlePairingSuccess = (state: PairingState) => {
    console.log('✅ Pairing successful:', state);
    setPairingState(state);
    setIsPairing(false);
    setError(null);

    // Show success message
    Alert.alert(
      'Pairing Successful',
      `Successfully paired with runner: ${state.runnerId}`,
      [
        {
          text: 'OK',
          onPress: () => {
            // Navigate to terminal screen
            router.replace('/');
          },
        },
      ]
    );
  };

  /**
   * Handle pairing error
   */
  const handlePairingError = (errorData: {
    code: PairingErrorCode;
    message: string;
    remainingBanTime?: number;
  }) => {
    console.error('❌ Pairing error:', errorData);
    setError(errorData.message);
    setIsPairing(false);
  };

  /**
   * Handle input change for code segments
   * Automatically formats and moves focus to next input
   */
  const handleCodeChange = (
    value: string,
    segment: 1 | 2 | 3,
    setter: (value: string) => void,
    nextRef?: React.RefObject<TextInput>
  ) => {
    // Only allow uppercase letters and numbers
    const sanitized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Limit to 3 characters
    const limited = sanitized.slice(0, 3);
    setter(limited);

    // Auto-focus next input when current is filled
    if (limited.length === 3 && nextRef) {
      nextRef.current?.focus();
    }
  };

  /**
   * Handle backspace on empty input - move to previous input
   */
  const handleKeyPress = (
    e: any,
    segment: 1 | 2 | 3,
    currentValue: string,
    prevRef?: React.RefObject<TextInput>
  ) => {
    if (e.nativeEvent.key === 'Backspace' && currentValue === '' && prevRef) {
      prevRef.current?.focus();
    }
  };

  /**
   * Submit pairing request
   */
  const handleSubmit = async () => {
    // Validate all segments are filled
    if (code1.length !== 3 || code2.length !== 3 || code3.length !== 3) {
      setError('Please enter a complete pairing code');
      return;
    }

    // Construct pairing code
    const pairingCode = `${code1}-${code2}-${code3}`;
    console.log('🔗 Submitting pairing code:', pairingCode);

    setIsPairing(true);
    setError(null);

    try {
      await appClient.pair(pairingCode);
      // Success is handled by the event listener
    } catch (err) {
      // Error is handled by the event listener
      console.error('Pairing request failed:', err);
    }
  };

  /**
   * Clear all inputs
   */
  const handleClear = () => {
    setCode1('');
    setCode2('');
    setCode3('');
    setError(null);
    input1Ref.current?.focus();
  };

  // Check if submit button should be enabled
  const isSubmitEnabled =
    code1.length === 3 &&
    code2.length === 3 &&
    code3.length === 3 &&
    !isPairing &&
    !isConnecting;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Pair with Runner</Text>
          <Text style={styles.subtitle}>
            Enter the 9-character pairing code displayed on your runner
          </Text>
        </View>

        {/* Connection Status */}
        {isConnecting && (
          <View style={styles.statusContainer}>
            <ActivityIndicator size="small" color="#89b4fa" />
            <Text style={styles.statusText}>Connecting to broker...</Text>
          </View>
        )}

        {/* Pairing Code Input */}
        <View style={styles.codeContainer}>
          <View style={styles.codeInputGroup}>
            <TextInput
              ref={input1Ref}
              style={styles.codeInput}
              value={code1}
              onChangeText={(value) =>
                handleCodeChange(value, 1, setCode1, input2Ref)
              }
              onKeyPress={(e) => handleKeyPress(e, 1, code1)}
              maxLength={3}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              editable={!isConnecting && !isPairing}
              placeholder="XXX"
              placeholderTextColor="#6c7086"
              keyboardType="default"
              returnKeyType="next"
            />
            <Text style={styles.separator}>-</Text>
            <TextInput
              ref={input2Ref}
              style={styles.codeInput}
              value={code2}
              onChangeText={(value) =>
                handleCodeChange(value, 2, setCode2, input3Ref)
              }
              onKeyPress={(e) => handleKeyPress(e, 2, code2, input1Ref)}
              maxLength={3}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isConnecting && !isPairing}
              placeholder="XXX"
              placeholderTextColor="#6c7086"
              keyboardType="default"
              returnKeyType="next"
            />
            <Text style={styles.separator}>-</Text>
            <TextInput
              ref={input3Ref}
              style={styles.codeInput}
              value={code3}
              onChangeText={(value) => handleCodeChange(value, 3, setCode3)}
              onKeyPress={(e) => handleKeyPress(e, 3, code3, input2Ref)}
              maxLength={3}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isConnecting && !isPairing}
              placeholder="XXX"
              placeholderTextColor="#6c7086"
              keyboardType="default"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>

          {/* Helper Text */}
          <Text style={styles.helperText}>
            Format: XXX-XXX-XXX (letters and numbers only)
          </Text>
        </View>

        {/* Error Message */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Pairing Status */}
        {isPairing && (
          <View style={styles.statusContainer}>
            <ActivityIndicator size="small" color="#89b4fa" />
            <Text style={styles.statusText}>Pairing with runner...</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[
              styles.submitButton,
              !isSubmitEnabled && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!isSubmitEnabled}
          >
            {isPairing ? (
              <ActivityIndicator size="small" color="#1e1e2e" />
            ) : (
              <Text style={styles.submitButtonText}>Pair</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClear}
            disabled={isPairing || isConnecting}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        </View>

        {/* Info Section */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>How to get a pairing code:</Text>
          <Text style={styles.infoText}>
            1. Start the runner on your computer
          </Text>
          <Text style={styles.infoText}>
            2. The pairing code will be displayed in the terminal
          </Text>
          <Text style={styles.infoText}>
            3. Enter the code above to pair this app with the runner
          </Text>
        </View>
      </KeyboardAvoidingView>
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
    padding: 20,
  },
  header: {
    marginTop: 40,
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#cdd6f4',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#a6adc8',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#313244',
    borderRadius: 8,
    marginBottom: 20,
  },
  statusText: {
    color: '#cdd6f4',
    fontSize: 14,
    marginLeft: 8,
  },
  codeContainer: {
    marginBottom: 20,
  },
  codeInputGroup: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  codeInput: {
    width: 80,
    height: 80,
    backgroundColor: '#313244',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#45475a',
    color: '#cdd6f4',
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  separator: {
    fontSize: 32,
    color: '#6c7086',
    marginHorizontal: 8,
    fontWeight: 'bold',
  },
  helperText: {
    fontSize: 12,
    color: '#6c7086',
    textAlign: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f38ba8',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  errorIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  errorText: {
    flex: 1,
    color: '#1e1e2e',
    fontSize: 14,
    fontWeight: '500',
  },
  buttonContainer: {
    marginBottom: 30,
  },
  submitButton: {
    backgroundColor: '#89b4fa',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  submitButtonDisabled: {
    backgroundColor: '#45475a',
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#1e1e2e',
    fontSize: 18,
    fontWeight: '600',
  },
  clearButton: {
    backgroundColor: '#313244',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#cdd6f4',
    fontSize: 16,
    fontWeight: '500',
  },
  infoContainer: {
    backgroundColor: '#313244',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#89b4fa',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#89b4fa',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#a6adc8',
    marginBottom: 4,
  },
});

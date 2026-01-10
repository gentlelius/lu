import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

interface QuickKeyboardProps {
  onKey: (key: string) => void;
}

const QUICK_KEYS = [
  { label: 'Yes', value: 'y\r' },
  { label: 'No', value: 'n\r' },
  { label: 'Enter', value: '\r' },
  { label: 'Tab', value: '\t' },
  { label: 'Ctrl+C', value: '\x03' },
  { label: 'Ctrl+D', value: '\x04' },
  { label: '↑', value: '\x1b[A' },
  { label: '↓', value: '\x1b[B' },
  { label: '←', value: '\x1b[D' },
  { label: '→', value: '\x1b[C' },
];

export function QuickKeyboard({ onKey }: QuickKeyboardProps) {
  return (
    <View style={styles.container}>
      {QUICK_KEYS.map((key) => (
        <TouchableOpacity
          key={key.label}
          style={styles.key}
          onPress={() => onKey(key.value)}
          activeOpacity={0.7}
        >
          <Text style={styles.keyText}>{key.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#1e1e2e',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 6,
    justifyContent: 'center',
  },
  key: {
    backgroundColor: '#313244',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 50,
    alignItems: 'center',
  },
  keyText: {
    color: '#cdd6f4',
    fontSize: 14,
    fontWeight: '600',
  },
});

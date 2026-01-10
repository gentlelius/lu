import React, { useRef, useEffect } from 'react';
import { ScrollView, Text, StyleSheet, View } from 'react-native';
import { parseAnsi, StyledText } from '../utils/ansi';

interface TerminalProps {
  output: string[];
}

function renderStyledText(segments: StyledText[], lineIndex: number) {
  return segments.map((segment, i) => (
    <Text
      key={`${lineIndex}-${i}`}
      style={[
        styles.text,
        segment.color && { color: segment.color },
        segment.backgroundColor && { backgroundColor: segment.backgroundColor },
        segment.bold && styles.bold,
        segment.italic && styles.italic,
        segment.underline && styles.underline,
      ]}
    >
      {segment.text}
    </Text>
  ));
}

export function Terminal({ output }: TerminalProps) {
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    // 自动滚动到底部
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [output]);

  return (
    <ScrollView
      ref={scrollViewRef}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {output.map((line, index) => {
        const segments = parseAnsi(line);
        return (
          <View key={index} style={styles.line}>
            {renderStyledText(segments, index)}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    padding: 12,
  },
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    minHeight: 20,
  },
  text: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: '#e2e8f0',
    lineHeight: 20,
  },
  bold: {
    fontWeight: 'bold',
  },
  italic: {
    fontStyle: 'italic',
  },
  underline: {
    textDecorationLine: 'underline',
  },
});

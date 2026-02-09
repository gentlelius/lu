import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import React, { useEffect } from 'react';

export default function RootLayout() {
  useEffect(() => {
    // 在 Web 平台上动态加载 xterm.js CSS
    if (Platform.OS === 'web') {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css';
      document.head.appendChild(link);

      return () => {
        document.head.removeChild(link);
      };
    }
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#1a1a2e' },
      }}
    />
  );
}

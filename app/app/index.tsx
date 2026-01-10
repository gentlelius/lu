import React, { useState, useEffect, useCallback, useRef } from 'react';
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
} from 'react-native';
import { XTerminal, XTerminalRef } from '../src/components/XTerminal';
import { QuickKeyboard } from '../src/components/QuickKeyboard';
import { socketService } from '../src/services/socket';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'session_active';

export default function TerminalScreen() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [sessionId, setSessionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [inputText, setInputText] = useState(''); // 命令输入
  
  // 终端 ref
  const terminalRef = useRef<XTerminalRef>(null);
  
  // 使用 ref 追踪当前活跃的 sessionId，避免闭包问题
  const activeSessionRef = useRef<string>('');
  // 防抖标志
  const isStartingSession = useRef(false);

  // 模拟 token (生产环境应从登录流程获取)
  const token = 'demo-token';
  const runnerId = 'runner-1';

  useEffect(() => {
    // 监听终端输出 - 直接写入 xterm
    const handleOutput = (data: { sessionId: string; data: string }) => {
      console.log('📺 Terminal output received:', data.data.length, 'chars');
      terminalRef.current?.write(data.data);
    };

    const handleSessionCreated = (data: { sessionId: string }) => {
      console.log('🚀 Session created and active:', data.sessionId);
      activeSessionRef.current = data.sessionId;
      isStartingSession.current = false;
      setSessionId(data.sessionId);
      setConnectionState('session_active');
      terminalRef.current?.write('\r\n--- Session started ---\r\n');
    };

    const handleSessionEnded = (data: { sessionId: string; reason?: string }) => {
      console.log('📴 Session ended event:', data.sessionId, 'Active:', activeSessionRef.current);
      // 只有当结束的是当前活跃会话时才切换状态
      if (activeSessionRef.current === data.sessionId) {
        activeSessionRef.current = '';
        setSessionId('');
        setConnectionState('connected');
        terminalRef.current?.write(`\r\n--- Session ended: ${data.reason || 'Unknown'} ---\r\n`);
      }
    };

    const handleRunnerOffline = () => {
      activeSessionRef.current = '';
      setConnectionState('connected');
      setError('Runner is offline');
    };

    socketService.on('terminal_output', handleOutput);
    socketService.on('session_created', handleSessionCreated);
    socketService.on('session_ended', handleSessionEnded);
    socketService.on('runner_offline', handleRunnerOffline);

    return () => {
      socketService.off('terminal_output', handleOutput);
      socketService.off('session_created', handleSessionCreated);
      socketService.off('session_ended', handleSessionEnded);
      socketService.off('runner_offline', handleRunnerOffline);
    };
  }, []);

  const handleConnect = useCallback(async () => {
    setConnectionState('connecting');
    setError(null);
    try {
      await socketService.connect(token);
      setConnectionState('connected');
    } catch (err) {
      setError('Failed to connect to broker');
      setConnectionState('disconnected');
    }
  }, []);

  const handleStartSession = useCallback(() => {
    // 防抖：如果正在创建会话，忽略重复点击
    if (isStartingSession.current) {
      console.log('⏳ Already starting session, ignoring...');
      return;
    }
    isStartingSession.current = true;
    
    const newSessionId = `session-${Date.now()}`;
    console.log('🚀 Starting new session:', newSessionId);
    activeSessionRef.current = newSessionId; // 预设，防止旧会话干扰
    socketService.connectToRunner(runnerId, newSessionId);
  }, []);

  // 处理终端输入 - 直接发送到 runner
  const handleTerminalInput = useCallback((data: string) => {
    if (sessionId) {
      socketService.sendInput(sessionId, data);
    }
  }, [sessionId]);

  // 快捷键处理
  const handleQuickKey = useCallback(
    (key: string) => {
      if (sessionId) {
        socketService.sendInput(sessionId, key);
      }
    },
    [sessionId]
  );

  // 发送命令 - 从输入框
  const handleSendCommand = useCallback(() => {
    if (inputText && sessionId) {
      socketService.sendInput(sessionId, inputText + '\n');
      setInputText('');
    }
  }, [inputText, sessionId]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Claude Remote</Text>
        <View style={styles.statusBadge}>
          <View
            style={[
              styles.statusDot,
              connectionState === 'session_active' && styles.statusActive,
              connectionState === 'connected' && styles.statusConnected,
              connectionState === 'connecting' && styles.statusConnecting,
            ]}
          />
          <Text style={styles.statusText}>{connectionState}</Text>
        </View>
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Main Content */}
      {connectionState === 'disconnected' && (
        <View style={styles.centerContent}>
          <TouchableOpacity style={styles.button} onPress={handleConnect}>
            <Text style={styles.buttonText}>Connect to Broker</Text>
          </TouchableOpacity>
        </View>
      )}

      {connectionState === 'connecting' && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#89b4fa" />
          <Text style={styles.loadingText}>Connecting...</Text>
        </View>
      )}

      {connectionState === 'connected' && (
        <View style={styles.centerContent}>
          <Text style={styles.infoText}>Connected to Broker</Text>
          <TouchableOpacity style={styles.button} onPress={handleStartSession}>
            <Text style={styles.buttonText}>Start Terminal Session</Text>
          </TouchableOpacity>
        </View>
      )}

      {connectionState === 'session_active' && (
        <KeyboardAvoidingView
          style={styles.terminalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* XTerminal - 完整的终端模拟器 */}
          <XTerminal
            ref={terminalRef}
            onInput={handleTerminalInput}
            fontSize={14}
          />

          {/* 命令输入框 */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSendCommand}
              placeholder="输入命令..."
              placeholderTextColor="#6c7086"
              autoCapitalize="none"
              autoCorrect={false}
              blurOnSubmit={false}
              returnKeyType="send"
            />
            <TouchableOpacity style={styles.sendButton} onPress={handleSendCommand}>
              <Text style={styles.sendButtonText}>发送</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Keyboard */}
          <QuickKeyboard onKey={handleQuickKey} />
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#313244',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#cdd6f4',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#313244',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6c7086',
    marginRight: 6,
  },
  statusActive: {
    backgroundColor: '#a6e3a1',
  },
  statusConnected: {
    backgroundColor: '#89b4fa',
  },
  statusConnecting: {
    backgroundColor: '#f9e2af',
  },
  statusText: {
    color: '#cdd6f4',
    fontSize: 12,
  },
  errorBanner: {
    backgroundColor: '#f38ba8',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorText: {
    color: '#1e1e2e',
    fontSize: 14,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  button: {
    backgroundColor: '#89b4fa',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    color: '#1e1e2e',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingText: {
    color: '#cdd6f4',
    fontSize: 16,
    marginTop: 16,
  },
  infoText: {
    color: '#a6e3a1',
    fontSize: 16,
    marginBottom: 20,
  },
  terminalContainer: {
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 8,
    backgroundColor: '#1e1e2e',
    borderTopWidth: 1,
    borderTopColor: '#313244',
  },
  input: {
    flex: 1,
    backgroundColor: '#313244',
    color: '#cdd6f4',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    fontFamily: 'monospace',
    fontSize: 14,
  },
  sendButton: {
    backgroundColor: '#89b4fa',
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 8,
    marginLeft: 8,
  },
  sendButtonText: {
    color: '#1e1e2e',
    fontWeight: '600',
  },
});

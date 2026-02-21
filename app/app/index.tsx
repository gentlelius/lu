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
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { XTerminal, XTerminalRef } from '../src/components/XTerminal';
import { QuickKeyboard } from '../src/components/QuickKeyboard';
import { HistoryPanel } from '../src/components/HistoryPanel';
import { socketService } from '../src/services/socket';
import { setHistorySocket } from '../src/services/history';
import { PairingState } from '../src/services/app-client';
import { getAppClient } from '../src/services/app-client-singleton';

/** localStorage key for persisting active session across page refreshes */
const ACTIVE_SESSION_KEY = 'lu_active_session_id';

type ConnectionState = 
  | 'disconnected' 
  | 'connecting' 
  | 'connected' 
  | 'not_paired' 
  | 'paired' 
  | 'runner_offline'
  | 'session_active';

export default function TerminalScreen() {
  const router = useRouter();
  const appClient = getAppClient();
  const { width } = useWindowDimensions();
  
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [pairingState, setPairingState] = useState<PairingState | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  // 历史消息
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  // 当前浏览的历史索引，-1 表示未浏览历史（显示当前草稿）
  const historyIndexRef = useRef(-1);
  // 保存在导航历史前输入的草稿
  const draftRef = useRef('');
  const terminalFontSize = Platform.OS === 'web' ? 14 : (width < 380 ? 10 : 12);
  
  // 终端 ref
  const terminalRef = useRef<XTerminalRef>(null);
  
  // 使用 ref 追踪当前活跃的 sessionId，避免闭包问题
  const activeSessionRef = useRef<string>('');
  // 缓存终端尺寸，session 创建后立即同步到 runner
  const terminalSizeRef = useRef<{ cols: number; rows: number }>({ cols: 80, rows: 24 });
  // 防抖标志
  const isStartingSession = useRef(false);

  useEffect(() => {
    // 连接到 broker 并检查配对状态
    connectToBroker();

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
      // Persist session ID so we can recover it after a page refresh
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(ACTIVE_SESSION_KEY, data.sessionId);
      }
      socketService.resize(
        data.sessionId,
        terminalSizeRef.current.cols,
        terminalSizeRef.current.rows
      );
      terminalRef.current?.write('\r\n--- Session started ---\r\n');
    };

    // Handle session resume confirmation from broker (after page refresh)
    const handleSessionResumed = (data: { sessionId: string; active: boolean }) => {
      console.log('🔁 Session resume response:', data);
      if (data.active) {
        activeSessionRef.current = data.sessionId;
        setSessionId(data.sessionId);
        setConnectionState('session_active');
        terminalRef.current?.write('\r\n--- Session resumed ---\r\n');
      } else {
        // Session no longer exists on broker/runner side; clear stored ID
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(ACTIVE_SESSION_KEY);
        }
      }
    };

    const handleSessionEnded = (data: { sessionId: string; reason?: string }) => {
      console.log('📴 Session ended event:', data.sessionId, 'Active:', activeSessionRef.current);
      // 只有当结束的是当前活跃会话时才切换状态
      if (activeSessionRef.current === data.sessionId) {
        activeSessionRef.current = '';
        setSessionId('');
        setConnectionState(pairingState?.isPaired ? 'paired' : 'not_paired');
        // Clear persisted session ID
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(ACTIVE_SESSION_KEY);
        }
        terminalRef.current?.write(`\r\n--- Session ended: ${data.reason || 'Unknown'} ---\r\n`);
      }
    };

    const handleRunnerOffline = () => {
      activeSessionRef.current = '';
      setConnectionState('runner_offline');
      setError('Runner is offline');
    };

    // 监听配对状态变化
    const handlePairingStatus = (state: PairingState) => {
      console.log('📊 Pairing status updated:', state);
      setPairingState(state);
      
      if (state.isPaired && state.runnerOnline) {
        setConnectionState('paired');
      } else if (state.isPaired && !state.runnerOnline) {
        setConnectionState('runner_offline');
      } else {
        setConnectionState('not_paired');
      }
    };

    const handleRunnerOnline = () => {
      console.log('🟢 Runner came online');
      if (pairingState?.isPaired) {
        setConnectionState('paired');
        setError(null);
      }
    };

    socketService.on('terminal_output', handleOutput);
    socketService.on('session_created', handleSessionCreated);
    socketService.on('session_resumed', handleSessionResumed);
    socketService.on('session_ended', handleSessionEnded);
    socketService.on('runner_offline', handleRunnerOffline);
    
    appClient.on('pairing:status', handlePairingStatus);
    appClient.on('runner:online', handleRunnerOnline);
    appClient.on('runner:offline', handleRunnerOffline);

    return () => {
      socketService.off('terminal_output', handleOutput);
      socketService.off('session_created', handleSessionCreated);
      socketService.off('session_resumed', handleSessionResumed);
      socketService.off('session_ended', handleSessionEnded);
      socketService.off('runner_offline', handleRunnerOffline);
      
      appClient.off('pairing:status', handlePairingStatus);
      appClient.off('runner:online', handleRunnerOnline);
      appClient.off('runner:offline', handleRunnerOffline);
      
      // Don't disconnect appClient here - it should persist across navigation
      // appClient.disconnect();
    };
  }, []);


  const connectToBroker = async () => {
    // Check if already connected
    if (appClient.isAppConnected()) {
      console.log('✅ Already connected to broker, checking pairing status...');
      try {
        // Configure socketService if not already done
        const socket = appClient.getSocket();
        if (socket) {
          socketService.setSocket(socket);
          setHistorySocket(socket);
        }
        
        const status = await appClient.getPairingStatus();
        setPairingState(status);
        
        if (status.isPaired && status.runnerOnline) {
          setConnectionState('paired');
        } else if (status.isPaired && !status.runnerOnline) {
          setConnectionState('runner_offline');
        } else {
          setConnectionState('not_paired');
        }
      } catch (err) {
        console.error('❌ Failed to get pairing status:', err);
      }
      return;
    }
    
    setConnectionState('connecting');
    setError(null);
    
    try {
      // TODO: Replace with actual JWT token from authentication
      const config = {
        brokerUrl: 'http://115.191.40.55:3000',
        jwtToken: 'demo-token',
      };

      await appClient.connect(config);
      console.log('✅ Connected to broker');
      
      // Configure socketService to use the same socket
      const socket = appClient.getSocket();
      if (socket) {
        socketService.setSocket(socket);
        // 历史记录 service 共享同一个 socket
        setHistorySocket(socket);
      }
      
      // 检查配对状态
      const status = await appClient.getPairingStatus();
      setPairingState(status);
      
      if (status.isPaired && status.runnerOnline) {
        setConnectionState('paired');
        // Try to resume a previous session (e.g. page refresh scenario)
        tryResumeSession();
      } else if (status.isPaired && !status.runnerOnline) {
        setConnectionState('runner_offline');
      } else {
        setConnectionState('not_paired');
      }
    } catch (err) {
      console.error('❌ Failed to connect to broker:', err);
      setError('Failed to connect to broker');
      setConnectionState('disconnected');
    }
  };

  /**
   * After reconnecting to the broker, check if there's a persisted session and
   * ask the broker to "resume" it (i.e., verify it's still alive on the runner side).
   * The broker will respond with session_resumed event.
   */
  const tryResumeSession = () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.localStorage) return;
    const savedSessionId = window.localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!savedSessionId) return;
    console.log('🔁 Attempting to resume session:', savedSessionId);
    activeSessionRef.current = savedSessionId;
    setSessionId(savedSessionId);
    socketService.resumeSession(savedSessionId);
  };

  const handleStartSession = useCallback(() => {
    // 防抖：如果正在创建会话，忽略重复点击
    if (isStartingSession.current) {
      console.log('⏳ Already starting session, ignoring...');
      return;
    }
    
    // 检查配对状态
    if (!pairingState?.isPaired || !pairingState.runnerId) {
      setError('Please pair with a runner first');
      Alert.alert(
        'Not Paired',
        'You need to pair with a runner before starting a session.',
        [
          {
            text: 'Go to Pairing',
            onPress: () => router.push('/pairing'),
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
      return;
    }
    
    if (!pairingState.runnerOnline) {
      setError('Runner is offline');
      Alert.alert(
        'Runner Offline',
        'The paired runner is currently offline. Please make sure it is running.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    isStartingSession.current = true;
    
    const newSessionId = `session-${Date.now()}`;
    console.log('🚀 Starting new session:', newSessionId, 'with runner:', pairingState.runnerId);
    activeSessionRef.current = newSessionId; // 预设，防止旧会话干扰
    
    // 使用配对的 runnerId
    socketService.connectToRunner(pairingState.runnerId, newSessionId);
  }, [pairingState, router]);

  // 处理终端输入 - 直接发送到 runner
  const handleTerminalInput = useCallback((data: string) => {
    if (sessionId) {
      socketService.sendInput(sessionId, data);
    }
  }, [sessionId]);

  const handleTerminalResize = useCallback((size: { cols: number; rows: number }) => {
    terminalSizeRef.current = size;
    if (sessionId) {
      socketService.resize(sessionId, size.cols, size.rows);
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
    if (!inputText || !sessionId) return;

    const currentSessionId = sessionId;
    const command = inputText;

    // 先发送文本，再单独发送回车，尽量模拟真实键入+Enter
    socketService.sendInput(currentSessionId, command);
    setTimeout(() => {
      socketService.sendInput(currentSessionId, '\r');
    }, 10);

    // 保存到历史记录（去重：如果和最近一条相同则不重复添加）
    setInputHistory(prev => {
      if (prev.length > 0 && prev[prev.length - 1] === command) return prev;
      return [...prev, command];
    });
    // 重置历史浏览索引和草稿
    historyIndexRef.current = -1;
    draftRef.current = '';
    setInputText('');
  }, [inputText, sessionId]);

  // 处理上下键浏览历史
  const handleHistoryKeyPress = useCallback(
    (e: { nativeEvent: { key: string } }) => {
      const key = e.nativeEvent.key;
      if (key !== 'ArrowUp' && key !== 'ArrowDown') return;

      setInputHistory(currentHistory => {
        if (currentHistory.length === 0) return currentHistory;

        setInputText(currentText => {
          let idx = historyIndexRef.current;

          if (key === 'ArrowUp') {
            // 第一次按上键：保存草稿
            if (idx === -1) {
              draftRef.current = currentText;
            }
            idx = idx === -1
              ? currentHistory.length - 1
              : Math.max(0, idx - 1);
          } else {
            // ArrowDown
            if (idx === -1) return currentText;
            idx = idx + 1;
            if (idx >= currentHistory.length) {
              // 回到草稿
              historyIndexRef.current = -1;
              return draftRef.current;
            }
          }

          historyIndexRef.current = idx;
          return currentHistory[idx];
        });

        return currentHistory;
      });
    },
    []
  );

  // 渲染状态指示器
  const renderStatusBadge = () => {
    let statusColor = '#6c7086';
    let statusText: string = connectionState;
    
    if (connectionState === 'session_active') {
      statusColor = '#a6e3a1';
      statusText = 'active';
    } else if (connectionState === 'paired') {
      statusColor = '#89b4fa';
      statusText = 'paired';
    } else if (connectionState === 'connecting') {
      statusColor = '#f9e2af';
      statusText = 'connecting';
    } else if (connectionState === 'runner_offline') {
      statusColor = '#f38ba8';
      statusText = 'offline';
    }
    
    return (
      <View style={styles.statusBadge}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={styles.statusText}>{statusText}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Cli Remote</Text>
        <View style={styles.headerRight}>
          {/* 历史记录面板 — 已配对或会话激活时可用 */}
          {(connectionState === 'paired' || connectionState === 'session_active') && (
            <HistoryPanel
              onSelectMessage={(text) => {
                setInputText(text);
              }}
            />
          )}
          <TouchableOpacity
            style={styles.pairingButton}
            onPress={() => router.push('/pairing')}
          >
            <Text style={styles.pairingButtonText}>Pair</Text>
          </TouchableOpacity>
          {renderStatusBadge()}
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
          <Text style={styles.infoText}>Disconnected from broker</Text>
          <TouchableOpacity style={styles.button} onPress={connectToBroker}>
            <Text style={styles.buttonText}>Reconnect</Text>
          </TouchableOpacity>
        </View>
      )}

      {connectionState === 'connecting' && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#89b4fa" />
          <Text style={styles.loadingText}>Connecting...</Text>
        </View>
      )}

      {connectionState === 'not_paired' && (
        <View style={styles.centerContent}>
          <Text style={styles.infoText}>Not paired with any runner</Text>
          <Text style={styles.helperText}>
            You need to pair with a runner before starting a terminal session
          </Text>
          <TouchableOpacity 
            style={styles.button} 
            onPress={() => router.push('/pairing')}
          >
            <Text style={styles.buttonText}>Go to Pairing</Text>
          </TouchableOpacity>
        </View>
      )}

      {connectionState === 'runner_offline' && (
        <View style={styles.centerContent}>
          <Text style={styles.warningText}>Runner is offline</Text>
          <Text style={styles.helperText}>
            Paired with: {pairingState?.runnerId}
          </Text>
          <Text style={styles.helperText}>
            Please make sure the runner is running on your computer
          </Text>
          <TouchableOpacity 
            style={styles.secondaryButton} 
            onPress={() => router.push('/pairing')}
          >
            <Text style={styles.secondaryButtonText}>Change Pairing</Text>
          </TouchableOpacity>
        </View>
      )}

      {connectionState === 'paired' && (
        <View style={styles.centerContent}>
          <Text style={styles.successText}>✓ Paired with runner</Text>
          <Text style={styles.helperText}>
            Runner ID: {pairingState?.runnerId}
          </Text>
          <TouchableOpacity style={styles.button} onPress={handleStartSession}>
            <Text style={styles.buttonText}>Start Terminal Session</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.secondaryButton} 
            onPress={() => router.push('/pairing')}
          >
            <Text style={styles.secondaryButtonText}>Change Pairing</Text>
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
            onResize={handleTerminalResize}
            fontSize={terminalFontSize}
          />

          {/* 命令输入框 */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={text => {
                // 手动输入时重置历史索引并更新草稿
                if (historyIndexRef.current === -1) {
                  draftRef.current = text;
                }
                historyIndexRef.current = -1;
                setInputText(text);
              }}
              onSubmitEditing={handleSendCommand}
              onKeyPress={handleHistoryKeyPress}
              placeholder="输入命令... (↑↓ 浏览历史)"
              placeholderTextColor="#6c7086"
              autoCapitalize="none"
              autoCorrect={false}
              blurOnSubmit={false}
              returnKeyType="send"
            />
            <TouchableOpacity style={styles.sendButton} onPress={handleSendCommand}>
              <Text style={styles.sendButtonText}>Send</Text>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pairingButton: {
    backgroundColor: '#89b4fa',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pairingButtonText: {
    color: '#1e1e2e',
    fontSize: 14,
    fontWeight: '600',
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
    marginRight: 6,
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
    marginTop: 20,
  },
  buttonText: {
    color: '#1e1e2e',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#313244',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
  },
  secondaryButtonText: {
    color: '#cdd6f4',
    fontSize: 16,
    fontWeight: '500',
  },
  loadingText: {
    color: '#cdd6f4',
    fontSize: 16,
    marginTop: 16,
  },
  infoText: {
    color: '#cdd6f4',
    fontSize: 18,
    marginBottom: 8,
    fontWeight: '500',
  },
  successText: {
    color: '#a6e3a1',
    fontSize: 18,
    marginBottom: 8,
    fontWeight: '500',
  },
  warningText: {
    color: '#f9e2af',
    fontSize: 18,
    marginBottom: 8,
    fontWeight: '500',
  },
  helperText: {
    color: '#a6adc8',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
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

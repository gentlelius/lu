import { io, Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// 获取 broker URL
// Broker 已部署到云端 115.191.40.55
// 所有平台统一使用云端地址
const getBrokerUrl = (): string => {
  // 尝试从 Expo manifest 中获取 host IP
  const debuggerHost = Constants.expoConfig?.hostUri?.split(':')[0];
  
  if (Platform.OS === 'web') {
    // Web 模式下使用云端 broker
    return 'http://115.191.40.55:3000';
  }
  
  // 真机或模拟器上，使用 debugger host IP
  if (debuggerHost) {
    console.log(`📱 Using broker host from Expo: ${debuggerHost}`);
    return `http://${debuggerHost}:3000`;
  }
  
  // 所有平台统一使用云端 broker
  return 'http://115.191.40.55:3000';
};

const BROKER_URL = getBrokerUrl();
console.log(`🌐 Broker URL: ${BROKER_URL}`);

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(BROKER_URL, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        console.log('🌐 Socket.io connected to Broker');
        this.socket?.emit('app_auth', { token });
      });
  
      this.socket.on('app_authenticated', (data) => {
        console.log('✅ App authenticated successfully:', data);
        resolve();
      });
  
      this.socket.on('connect_error', (error) => {
        console.error('❌ Socket.io connection error:', error);
        reject(error);
      });
  
      this.socket.on('error', (data) => {
        console.error('⚠️ Socket.io server-side error:', data);
      });

      // 转发所有事件给监听器
      ['terminal_output', 'session_created', 'session_ended', 'runner_offline'].forEach(
        (event) => {
          this.socket?.on(event, (data) => {
            this.emit(event, data);
          });
        }
      );
    });
  }

  connectToRunner(runnerId: string, sessionId: string): void {
    this.socket?.emit('connect_runner', { runnerId, sessionId });
  }

  sendInput(sessionId: string, data: string): void {
    this.socket?.emit('terminal_input', { sessionId, data });
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.socket?.emit('terminal_resize', { sessionId, cols, rows });
  }

  on(event: string, callback: (data: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
  }

  off(event: string, callback: (data: any) => void): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any): void {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.listeners.clear();
  }
}

export const socketService = new SocketService();

import { io, Socket } from 'socket.io-client';
import { Config } from './config';
import { PtyManager } from './pty-manager';

export class SocketClient {
  private socket: Socket | null = null;
  private ptyManager = new PtyManager();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;

  constructor(private config: Config) {}

  connect(): void {
    console.log(`🔌 Connecting to broker: ${this.config.brokerUrl}`);

    this.socket = io(this.config.brokerUrl, {
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ Connected to broker');
      this.reconnectAttempts = 0;
      
      // 注册 Runner
      this.socket?.emit('runner_register', {
        runnerId: this.config.runnerId,
        secret: this.config.runnerSecret,
      });
    });

    this.socket.on('runner_registered', (data) => {
      console.log(`✅ Runner registered: ${data.runnerId}`);
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`❌ Disconnected from broker: ${reason}`);
    });

    this.socket.on('connect_error', (error) => {
      console.error(`❌ Connection error: ${error.message}`);
      this.reconnectAttempts++;
    });

    this.socket.on('error', (data) => {
      console.error(`❌ Server error: ${data.message}`);
    });

    // 创建 PTY session
    this.socket.on('create_session', (data: { sessionId: string }) => {
      console.log(`📟 Creating session: ${data.sessionId}`);
      
      this.ptyManager.createSession(
        data.sessionId,
        // onData: 发送输出给 Broker
        (output) => {
          this.socket?.emit('terminal_output', {
            sessionId: data.sessionId,
            data: output,
          });
        },
        // onExit: 通知 Broker session 结束
        (exitCode) => {
          this.socket?.emit('session_ended', {
            sessionId: data.sessionId,
            reason: `Process exited with code ${exitCode}`,
          });
        },
      );
    });

    // 接收终端输入
    this.socket.on('terminal_input', (data: { sessionId: string; data: string }) => {
      this.ptyManager.write(data.sessionId, data.data);
    });

    // 接收终端尺寸调整
    this.socket.on('terminal_resize', (data: { sessionId: string; cols: number; rows: number }) => {
      this.ptyManager.resize(data.sessionId, data.cols, data.rows);
    });
  }

  disconnect(): void {
    this.ptyManager.killAll();
    this.socket?.disconnect();
    this.socket = null;
  }
}

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RunnerService } from '../runner/runner.service';
import { AuthService } from '../auth/auth.service';

interface RunnerRegisterPayload {
  runnerId: string;
  secret: string;
}

interface SessionPayload {
  sessionId: string;
  runnerId: string;
  data?: string;
  cols?: number;
  rows?: number;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  // sessionId -> { appSocketId, runnerId }
  private sessions = new Map<string, { appSocketId: string; runnerId: string }>();
  // socketId -> runnerId (用于 Runner 断开时清理)
  private socketToRunner = new Map<string, string>();
  // socketId -> userId (用于 App 断开时清理)
  private socketToUser = new Map<string, string>();

  constructor(
    private readonly runnerService: RunnerService,
    private readonly authService: AuthService,
  ) {}

  handleConnection(client: Socket) {
    console.log(`🔌 Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`🔌 Client disconnected: ${client.id}`);

    // 清理 Runner
    const runnerId = this.socketToRunner.get(client.id);
    if (runnerId) {
      this.runnerService.unregisterRunner(runnerId);
      this.socketToRunner.delete(client.id);
      
      // 通知所有连接到该 Runner 的 App
      this.sessions.forEach((session, sessionId) => {
        if (session.runnerId === runnerId) {
          const appSocket = this.server.sockets.sockets.get(session.appSocketId);
          appSocket?.emit('runner_offline', { runnerId });
          this.sessions.delete(sessionId);
        }
      });
    }

    // 清理 App 用户
    this.socketToUser.delete(client.id);
  }

  // Runner 注册
  @SubscribeMessage('runner_register')
  handleRunnerRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RunnerRegisterPayload,
  ) {
    const { runnerId, secret } = payload;

    if (!this.authService.validateRunnerCredentials(runnerId, secret)) {
      client.emit('error', { message: 'Invalid runner credentials' });
      client.disconnect();
      return;
    }

    this.runnerService.registerRunner(runnerId, client);
    this.socketToRunner.set(client.id, runnerId);
    client.emit('runner_registered', { runnerId });
  }

  // App 认证
  @SubscribeMessage('app_auth')
  handleAppAuth(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { token: string },
  ) {
    const user = this.authService.validateAppToken(payload.token);
    if (!user) {
      client.emit('error', { message: 'Invalid token' });
      client.disconnect();
      return;
    }

    this.socketToUser.set(client.id, user.sub);
    client.emit('app_authenticated', { 
      userId: user.sub,
      runners: this.runnerService.getOnlineRunnerIds(),
    });
  }

  // App 请求连接 Runner
  @SubscribeMessage('connect_runner')
  handleConnectRunner(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { runnerId: string; sessionId: string },
  ) {
    const runner = this.runnerService.getRunner(payload.runnerId);
    if (!runner) {
      client.emit('error', { message: 'Runner not found or offline' });
      return;
    }

    this.sessions.set(payload.sessionId, {
      appSocketId: client.id,
      runnerId: payload.runnerId,
    });

    // 通知 Runner 创建 PTY session
    runner.socket.emit('create_session', { sessionId: payload.sessionId });
    client.emit('session_created', { sessionId: payload.sessionId });
  }

  // App -> Runner: 终端输入
  @SubscribeMessage('terminal_input')
  handleTerminalInput(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SessionPayload,
  ) {
    console.log(`📡 Broker: Received input for session ${payload.sessionId}: ${JSON.stringify(payload.data)}`);
    const session = this.sessions.get(payload.sessionId);
    if (!session) {
      console.log(`⚠️ Broker: Session ${payload.sessionId} not found`);
      return;
    }

    const runner = this.runnerService.getRunner(session.runnerId);
    if (!runner) {
      console.log(`⚠️ Broker: Runner ${session.runnerId} not found for session`);
      return;
    }
    
    runner.socket.emit('terminal_input', payload);
  }

  // App -> Runner: 终端尺寸调整
  @SubscribeMessage('terminal_resize')
  handleTerminalResize(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SessionPayload,
  ) {
    const session = this.sessions.get(payload.sessionId);
    if (!session) return;

    const runner = this.runnerService.getRunner(session.runnerId);
    runner?.socket.emit('terminal_resize', payload);
  }

  // Runner -> App: 终端输出
  @SubscribeMessage('terminal_output')
  handleTerminalOutput(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SessionPayload,
  ) {
    console.log(`📡 Broker: Received output for session ${payload.sessionId}: ${JSON.stringify(payload.data?.substring(0, 100))}`);
    const session = this.sessions.get(payload.sessionId);
    if (!session) {
      console.log(`⚠️ Broker: Session ${payload.sessionId} not found for output`);
      return;
    }

    const appSocket = this.server.sockets.sockets.get(session.appSocketId);
    if (!appSocket) {
      console.log(`⚠️ Broker: App socket ${session.appSocketId} not found`);
      return;
    }
    console.log(`📡 Broker: Forwarding output to app socket ${session.appSocketId}`);
    appSocket.emit('terminal_output', payload);
  }

  // Runner -> App: 会话结束
  @SubscribeMessage('session_ended')
  handleSessionEnded(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; reason?: string },
  ) {
    const session = this.sessions.get(payload.sessionId);
    if (!session) return;

    const appSocket = this.server.sockets.sockets.get(session.appSocketId);
    appSocket?.emit('session_ended', payload);
    this.sessions.delete(payload.sessionId);
  }
}

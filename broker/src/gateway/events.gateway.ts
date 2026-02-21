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
import { PairingSessionService } from '../pairing/pairing-session/pairing-session.service';

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

  // sessionId -> { appClientToken (stable), appSocketId (current socket), runnerId }
  private sessions = new Map<string, { appClientToken: string; appSocketId: string; runnerId: string }>();
  // socketId -> runnerId (用于 Runner 断开时清理)
  private socketToRunner = new Map<string, string>();
  // clientToken -> userId (用于 App 断开时清理)
  private clientTokenToUser = new Map<string, string>();

  constructor(
    private readonly runnerService: RunnerService,
    private readonly authService: AuthService,
    private readonly pairingSessionService: PairingSessionService,
  ) {}

  /** Extract the stable clientToken from socket handshake auth, fallback to socket.id */
  private getClientToken(client: Socket): string {
    return (client.handshake.auth?.clientToken as string) || client.id;
  }

  handleConnection(client: Socket) {
    const clientToken = this.getClientToken(client);
    console.log(`🔌 Client connected: ${client.id} (token: ${clientToken})`);

    // Session takeover: if this clientToken has active sessions, update appSocketId to new socket
    let takenOver = 0;
    this.sessions.forEach((session, sessionId) => {
      if (session.appClientToken === clientToken) {
        session.appSocketId = client.id;
        takenOver++;
      }
    });
    if (takenOver > 0) {
      console.log(`🔄 Session takeover: clientToken ${clientToken} reclaimed ${takenOver} session(s) on new socket ${client.id}`);
    }
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
          // Try to notify via current appSocketId
          const appSocket = this.server.sockets.sockets.get(session.appSocketId);
          appSocket?.emit('runner_offline', { runnerId });
          this.sessions.delete(sessionId);
        }
      });
    }

    // 清理 App 用户 (keyed by clientToken, not socket.id)
    const clientToken = this.getClientToken(client);
    // Only remove the user mapping if the current socket IS the active socket
    // (i.e., not already superseded by a newer connection from same clientToken)
    const activeSessionStillUsing = [...this.sessions.values()].some(
      (s) => s.appClientToken === clientToken && s.appSocketId === client.id
    );
    if (!activeSessionStillUsing) {
      this.clientTokenToUser.delete(clientToken);
    }
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

    const clientToken = this.getClientToken(client);
    this.clientTokenToUser.set(clientToken, user.sub);
    client.emit('app_authenticated', { 
      userId: user.sub,
      runners: this.runnerService.getOnlineRunnerIds(),
    });
  }

  // App 请求连接 Runner
  @SubscribeMessage('connect_runner')
  async handleConnectRunner(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { runnerId: string; sessionId: string },
  ) {
    // SECURITY: Verify that the app is paired with the runner
    // Use stable clientToken (same key used by PairingGateway)
    const clientToken = this.getClientToken(client);
    
    // Check if the app is paired with this runner
    const session = await this.pairingSessionService.getSession(clientToken);
    if (!session || session.runnerId !== payload.runnerId) {
      console.error(`❌ Security: App ${clientToken} attempted to connect to unpaired runner ${payload.runnerId}`);
      client.emit('error', { 
        message: 'Not paired with this runner. Please pair first using a pairing code.',
        code: 'NOT_PAIRED'
      });
      return;
    }

    console.log(`✅ Security: App ${clientToken} is authorized to connect to runner ${payload.runnerId}`);

    // Check if runner is online
    const runner = this.runnerService.getRunner(payload.runnerId);
    if (!runner) {
      client.emit('error', { message: 'Runner not found or offline' });
      return;
    }

    this.sessions.set(payload.sessionId, {
      appClientToken: clientToken,
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

  // App: 刷新页面后请求恢复之前的 session
  @SubscribeMessage('session_resume')
  handleSessionResume(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ) {
    const clientToken = this.getClientToken(client);
    const session = this.sessions.get(payload.sessionId);

    // Verify the session exists and belongs to this client
    if (session && session.appClientToken === clientToken) {
      // Update to the new socket (session takeover already done in handleConnection,
      // but explicitly confirm here just in case)
      session.appSocketId = client.id;
      console.log(`✅ Broker: Session ${payload.sessionId} resumed for clientToken ${clientToken} on socket ${client.id}`);
      client.emit('session_resumed', { sessionId: payload.sessionId, active: true });
    } else {
      console.log(`⚠️ Broker: Session ${payload.sessionId} not found or belongs to different client (token: ${clientToken})`);
      client.emit('session_resumed', { sessionId: payload.sessionId, active: false });
    }
  }

  // ─── 历史记录转发 ────────────────────────────────────────────

  /**
   * App 请求历史会话列表
   * App -> Broker -> Runner (history:list)
   * Runner -> Broker (history:list:result) -> App
   */
  @SubscribeMessage('history:list')
  async handleHistoryList(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { requestId: string; projectPath?: string },
  ) {
    const clientToken = this.getClientToken(client);
    const pairingSession = await this.pairingSessionService.getSession(clientToken);
    if (!pairingSession) {
      client.emit('history:list:result', {
        requestId: payload.requestId,
        sessions: [],
        error: 'Not paired with any runner',
      });
      return;
    }

    const runner = this.runnerService.getRunner(pairingSession.runnerId);
    if (!runner) {
      client.emit('history:list:result', {
        requestId: payload.requestId,
        sessions: [],
        error: 'Runner is offline',
      });
      return;
    }

    // 将 App 的 socket.id 附加到 requestId 中，方便回传时路由到此 App
    const routedRequestId = `${client.id}::${payload.requestId}`;
    console.log(`📚 Broker: forwarding history:list to runner ${pairingSession.runnerId}`);
    runner.socket.emit('history:list', {
      requestId: routedRequestId,
      projectPath: payload.projectPath,
    });
  }

  /**
   * App 请求单个历史会话详情
   * App -> Broker -> Runner (history:get)
   * Runner -> Broker (history:get:result) -> App
   */
  @SubscribeMessage('history:get')
  async handleHistoryGet(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { requestId: string; sessionId: string; projectPath?: string },
  ) {
    const clientToken = this.getClientToken(client);
    const pairingSession = await this.pairingSessionService.getSession(clientToken);
    if (!pairingSession) {
      client.emit('history:get:result', {
        requestId: payload.requestId,
        session: null,
        error: 'Not paired with any runner',
      });
      return;
    }

    const runner = this.runnerService.getRunner(pairingSession.runnerId);
    if (!runner) {
      client.emit('history:get:result', {
        requestId: payload.requestId,
        session: null,
        error: 'Runner is offline',
      });
      return;
    }

    const routedRequestId = `${client.id}::${payload.requestId}`;
    console.log(`📖 Broker: forwarding history:get to runner ${pairingSession.runnerId}`);
    runner.socket.emit('history:get', {
      requestId: routedRequestId,
      sessionId: payload.sessionId,
      projectPath: payload.projectPath,
    });
  }

  /**
   * Runner 返回历史会话列表结果 -> Broker -> App
   */
  @SubscribeMessage('history:list:result')
  handleHistoryListResult(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: { requestId: string; sessions: unknown[]; error: string | null },
  ) {
    // requestId 格式为 "appSocketId::originalRequestId"
    const [appSocketId, ...rest] = payload.requestId.split('::');
    const originalRequestId = rest.join('::');
    const appSocket = this.server.sockets.sockets.get(appSocketId);
    if (!appSocket) {
      console.warn(`⚠️ Broker: App socket ${appSocketId} not found for history:list:result`);
      return;
    }
    console.log(`📚 Broker: forwarding history:list:result to app socket ${appSocketId}`);
    appSocket.emit('history:list:result', {
      requestId: originalRequestId,
      sessions: payload.sessions,
      error: payload.error,
    });
  }

  /**
   * Runner 返回历史会话详情结果 -> Broker -> App
   */
  @SubscribeMessage('history:get:result')
  handleHistoryGetResult(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: { requestId: string; session: unknown; error: string | null },
  ) {
    const [appSocketId, ...rest] = payload.requestId.split('::');
    const originalRequestId = rest.join('::');
    const appSocket = this.server.sockets.sockets.get(appSocketId);
    if (!appSocket) {
      console.warn(`⚠️ Broker: App socket ${appSocketId} not found for history:get:result`);
      return;
    }
    console.log(`📖 Broker: forwarding history:get:result to app socket ${appSocketId}`);
    appSocket.emit('history:get:result', {
      requestId: originalRequestId,
      session: payload.session,
      error: payload.error,
    });
  }
}


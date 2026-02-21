import { Socket } from 'socket.io-client';

export interface SessionSummary {
  sessionId: string;
  projectPath: string;
  summary: string;
  lastTimestamp: string | null;
  messageCount: number;
}

export interface SessionMessage {
  uuid: string;
  parentUuid: string | null;
  type: string;
  timestamp: string;
  message?: {
    role: string;
    content: string | Array<{ type: string; text?: string }>;
  };
  summary?: string;
}

export interface SessionDetail extends SessionSummary {
  messages: SessionMessage[];
}

/** 从 SessionMessage 中提取纯文本内容 */
export function extractMessageText(msg: SessionMessage): string {
  if (!msg.message?.content) return '';
  const c = msg.message.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .filter((p) => p.type === 'text' && p.text)
      .map((p) => p.text!)
      .join('');
  }
  return '';
}

/** 格式化时间戳为本地时间字符串 */
export function formatTimestamp(ts: string | null): string {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

let _socket: Socket | null = null;

export function setHistorySocket(socket: Socket) {
  _socket = socket;
}

/**
 * 请求历史会话列表
 * @param projectPath 可选，过滤指定项目路径的会话
 * @param timeoutMs   请求超时时间，默认 10000ms
 */
export function listSessions(
  projectPath?: string,
  timeoutMs = 10000,
): Promise<SessionSummary[]> {
  return new Promise((resolve, reject) => {
    if (!_socket) {
      reject(new Error('Socket not configured'));
      return;
    }

    const requestId = `hist-list-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const timer = setTimeout(() => {
      _socket?.off('history:list:result', handler);
      reject(new Error('history:list timeout'));
    }, timeoutMs);

    const handler = (data: {
      requestId: string;
      sessions: SessionSummary[];
      error: string | null;
    }) => {
      if (data.requestId !== requestId) return;
      clearTimeout(timer);
      _socket?.off('history:list:result', handler);
      if (data.error) {
        reject(new Error(data.error));
      } else {
        resolve(data.sessions);
      }
    };

    _socket.on('history:list:result', handler);
    _socket.emit('history:list', { requestId, projectPath });
  });
}

/**
 * 请求单个会话的完整消息记录
 */
export function getSession(
  sessionId: string,
  projectPath?: string,
  timeoutMs = 10000,
): Promise<SessionDetail> {
  return new Promise((resolve, reject) => {
    if (!_socket) {
      reject(new Error('Socket not configured'));
      return;
    }

    const requestId = `hist-get-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const timer = setTimeout(() => {
      _socket?.off('history:get:result', handler);
      reject(new Error('history:get timeout'));
    }, timeoutMs);

    const handler = (data: {
      requestId: string;
      session: SessionDetail | null;
      error: string | null;
    }) => {
      if (data.requestId !== requestId) return;
      clearTimeout(timer);
      _socket?.off('history:get:result', handler);
      if (data.error || !data.session) {
        reject(new Error(data.error || 'Session not found'));
      } else {
        resolve(data.session);
      }
    };

    _socket.on('history:get:result', handler);
    _socket.emit('history:get', { requestId, sessionId, projectPath });
  });
}

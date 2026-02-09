# Claude Remote 系统流程图

## 系统架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                         云服务器 (ECS)                            │
│                                                                  │
│  ┌──────────────┐         ┌──────────────┐                      │
│  │              │         │              │                      │
│  │   Broker     │◄────────┤    Redis     │                      │
│  │   (NestJS)   │         │  (配对/会话)  │                      │
│  │              │         │              │                      │
│  └──────┬───────┘         └──────────────┘                      │
│         │                                                        │
│         │ WebSocket (配对验证 + 终端通信)                        │
│         │                                                        │
└─────────┼────────────────────────────────────────────────────────┘
          │
          │
    ┌─────┴─────┐
    │           │
┌───▼───┐   ┌───▼────┐
│ App   │   │ Runner │
│ (RN)  │   │ (CLI)  │
└───────┘   └────────┘
```

---

## 1. 配对流程 (Pairing Flow)

```
┌─────────────┐                              ┌─────────────┐
│   Runner    │                              │    App      │
│  (CLI Tool) │                              │  (Mobile)   │
└──────┬──────┘                              └──────┬──────┘
       │                                             │
       │ 1. 启动并连接到 Broker                       │
       ├────────────────────────────────────────────►│
       │                                             │
       │ 2. 生成配对码 (XXX-XXX-XXX)                  │
       │    例如: ABC-123-XYZ                         │
       │                                             │
       │              显示配对码给用户                │
       │              ┌────────────────┐             │
       │              │  PAIRING CODE  │             │
       │              │  ABC-123-XYZ   │             │
       │              └────────────────┘             │
       │                                             │
       │                                 3. 用户输入配对码
       │                                             │
       │                             4. 发送配对请求  │
       │◄────────────────────────────────────────────┤
       │    app:pair { pairingCode: "ABC-123-XYZ" }  │
       │                                             │
       │ 5. Broker 验证配对码                         │
       │    ✓ 检查格式                               │
       │    ✓ 检查是否存在                           │
       │    ✓ 检查是否过期 (10分钟)                   │
       │    ✓ 检查 Runner 是否在线                   │
       │                                             │
       │ 6. 创建配对会话 (存储在 Redis)               │
       │    key: pairing:session:{appSessionId}      │
       │    value: { runnerId, pairedAt }            │
       │                                             │
       │ 7. 返回配对成功                             │
       ├────────────────────────────────────────────►│
       │    app:pair:success { runnerId }            │
       │                                             │
       │                                8. 配对成功!  │
       │                                显示: "✓ 已配对"
       │                                             │
```

### 配对流程详细步骤

#### Runner 端

1. **连接 Broker** (`runner/src/runner-client.ts:86`)
   ```typescript
   socket = io(brokerUrl, {
     reconnection: true,
     reconnectionAttempts: Infinity,
   });
   ```

2. **生成配对码** (`runner/src/runner-client.ts:221`)
   ```typescript
   pairingCode = codeGenerator.generate(); // ABC-123-XYZ
   ```

3. **注册配对码** (`runner/src/runner-client.ts:240`)
   ```typescript
   socket.emit('runner:register', {
     runnerId,
     pairingCode,
     secret,
   });
   ```

4. **发送心跳** (每10秒)
   ```typescript
   socket.emit('runner:heartbeat', { runnerId });
   ```

#### Broker 端

5. **验证 Runner** (`broker/src/pairing/gateway/pairing.gateway.ts:198`)
   ```typescript
   @SubscribeMessage('runner:register')
   async handleRunnerRegister(client, payload) {
     // 验证密钥
     // 验证配对码格式
     // 存储到 Redis: pairing:code:{code}
   }
   ```

6. **处理 App 配对请求** (`broker/src/pairing/gateway/pairing.gateway.ts:322`)
   ```typescript
   @SubscribeMessage('app:pair')
   async handleAppPair(client, { pairingCode }) {
     // 1. 检查频率限制 (5次/分钟)
     // 2. 验证配对码格式
     // 3. 检查配对码是否存在
     // 4. 检查是否过期
     // 5. 检查 Runner 是否在线
     // 6. 创建配对会话
     // 7. 记录配对历史
   }
   ```

#### App 端

7. **连接 Broker** (`app/app/index.tsx:141`)
   ```typescript
   await appClient.connect({
     brokerUrl: 'http://115.191.40.55:3000',
     jwtToken: 'demo-token',
   });
   ```

8. **发送配对请求** (`app/src/services/app-client-singleton.ts`)
   ```typescript
   socket.emit('app:pair', { pairingCode: 'ABC-123-XYZ' });
   ```

9. **接收配对结果** (`app/app/index.tsx:96`)
   ```typescript
   socket.on('app:pair:success', ({ runnerId }) => {
     setConnectionState('paired');
     setPairingState({ isPaired: true, runnerId });
   });
   ```

---

## 2. 终端会话流程 (Terminal Session Flow)

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Runner    │      │   Broker    │      │    App      │
│  (CLI)      │      │  (NestJS)   │      │  (Mobile)   │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                     │                     │
       │                     │ 1. 点击 "Start Session"
       │                     │◄────────────────────┤
       │                     │  connect_runner { runnerId, sessionId }
       │                     │                     │
       │                     │ 2. 验证配对关系      │
       │                     │  ✓ 检查 app 是否已配对
       │                     │                     │
       │ 3. 创建 PTY        │                     │
       │◄────────────────────┤                     │
       │ create_session { sessionId }              │
       │                     │                     │
       │ ✓ 创建伪终端        │                     │
       │ ✓ 启动 Shell       │                     │
       │                     │                     │
       │ 4. 会话已创建        │ 5. 通知 App         │
       ├────────────────────►├────────────────────►│
       │ session_created { sessionId }             │
       │                     │                     │
       │                     │              6. 显示终端
       │                     │              XTerminal 初始化
       │                     │                     │
       │                     │ 7. 用户输入命令      │
       │                     │◄────────────────────┤
       │                     │ terminal_input { data }
       │                     │                     │
       │ 8. 写入 PTY        │                     │
       │◄────────────────────┤                     │
       │ terminal_input { data }                   │
       │                     │                     │
       │ ✓ 执行命令         │                     │
       │ ✓ 产生输出         │                     │
       │                     │                     │
       │ 9. 终端输出         │ 10. 转发输出         │
       ├────────────────────►├────────────────────►│
       │ terminal_output { data }                  │
       │                     │                     │
       │                     │              11. 显示输出
       │                     │              xterm.write(data)
       │                     │                     │
       │ 12. 调整终端尺寸    │                     │
       │◄────────────────────┤                     │
       │ terminal_resize { cols, rows }            │
       │                     │                     │
       │ ✓ 调整 PTY 尺寸   │                     │
       │                     │                     │
       │ 13. 会话结束        │ 14. 通知 App         │
       ├────────────────────►├────────────────────►│
       │ session_ended { reason }                  │
       │                     │                     │
       │ ✓ 关闭 PTY        │              15. 显示结束消息
       │                     │              "--- Session ended ---"
```

### 终端会话详细步骤

#### App 端

1. **启动会话** (`app/app/index.tsx:205`)
   ```typescript
   const handleStartSession = () => {
     const sessionId = `session-${Date.now()}`;
     socketService.connectToRunner(pairingState.runnerId, sessionId);
   };
   ```

2. **发送连接请求** (`app/src/services/socket.ts`)
   ```typescript
   socket.emit('connect_runner', {
     runnerId: 'runner-123',
     sessionId: 'session-1234567890',
   });
   ```

3. **接收会话创建确认** (`app/app/index.tsx:64`)
   ```typescript
   socket.on('session_created', ({ sessionId }) => {
     activeSessionRef.current = sessionId;
     setConnectionState('session_active');
     terminalRef.current?.write('\r\n--- Session started ---\r\n');
   });
   ```

4. **处理用户输入** (`app/app/index.tsx:253`)
   ```typescript
   const handleTerminalInput = (data: string) => {
     socketService.sendInput(sessionId, data);
   };
   ```

5. **接收终端输出** (`app/app/index.tsx:59`)
   ```typescript
   socket.on('terminal_output', ({ data }) => {
     terminalRef.current?.write(data);
   });
   ```

6. **调整终端尺寸** (`app/app/index.tsx:259`)
   ```typescript
   const handleTerminalResize = (size) => {
     socketService.resize(sessionId, size.cols, size.rows);
   };
   ```

#### Broker 端

7. **验证配对关系** (`broker/src/gateway/events.gateway.ts:119`)
   ```typescript
   @SubscribeMessage('connect_runner')
   async handleConnectRunner(client, { runnerId, sessionId }) {
     const session = await pairingSessionService.getSession(appSessionId);
     if (!session || session.runnerId !== runnerId) {
       client.emit('error', { message: 'Not paired with this runner' });
       return;
     }
     // 通知 Runner 创建 PTY
     runner.socket.emit('create_session', { sessionId });
   }
   ```

8. **转发终端输入** (`broker/src/gateway/events.gateway.ts:159`)
   ```typescript
   @SubscribeMessage('terminal_input')
   handleTerminalInput(client, { sessionId, data }) {
     const session = sessions.get(sessionId);
     const runner = runnerService.getRunner(session.runnerId);
     runner.socket.emit('terminal_input', { sessionId, data });
   }
   ```

9. **转发终端输出** (`broker/src/gateway/events.gateway.ts:194`)
   ```typescript
   @SubscribeMessage('terminal_output')
   handleTerminalOutput(client, { sessionId, data }) {
     const session = sessions.get(sessionId);
     const appSocket = server.sockets.sockets.get(session.appSocketId);
     appSocket.emit('terminal_output', { sessionId, data });
   }
   ```

#### Runner 端

10. **创建 PTY** (`runner/src/pty-manager.ts`)
    ```typescript
    const pty = spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME,
      env: process.env,
    });

    pty.onData((data) => {
      socket.emit('terminal_output', { sessionId, data });
    });
    ```

11. **处理终端输入** (`runner/src/socket-client.ts`)
    ```typescript
    socket.on('terminal_input', ({ sessionId, data }) => {
      const pty = ptyManager.getSession(sessionId);
      pty.write(data);
    });
    ```

12. **调整 PTY 尺寸**
    ```typescript
    socket.on('terminal_resize', ({ sessionId, cols, rows }) => {
      const pty = ptyManager.getSession(sessionId);
      pty.resize(cols, rows);
    });
    ```

---

## 3. 数据存储结构 (Redis)

### 配对码 (Pairing Code)
```
Key: pairing:code:ABC-123-XYZ
Value: {
  runnerId: "runner-123",
  createdAt: 1234567890,
  expiresAt: 1234570890,  // +10分钟
  usageCount: 2
}
TTL: 600 秒 (10分钟)
```

### 配对会话 (Pairing Session)
```
Key: pairing:session:app-session-id
Value: {
  runnerId: "runner-123",
  pairedAt: 1234567890
}
TTL: 无 (永久，直到主动解除)
```

### Runner 心跳
```
Key: pairing:heartbeat:runner-123
Value: 1234567890 (最后心跳时间戳)
TTL: 30 秒
```

### 频率限制 (Rate Limit)
```
Key: pairing:ratelimit:app-session-id
Value: 3 (失败次数)
TTL: 60 秒
```

---

## 4. 安全机制

### 4.1 配对码安全
- ✓ 格式验证 (XXX-XXX-XXX)
- ✓ 10分钟自动过期
- ✓ 使用后失效
- ✓ 防碰撞机制

### 4.2 访问控制
- ✓ Runner 密钥验证
- ✓ App JWT Token 验证
- ✓ 配对关系验证 (每个请求)
- ✓ Socket ID 绑定

### 4.3 防护机制
- ✓ 频率限制 (5次/分钟)
- ✓ 自动封禁 (60秒)
- ✓ 心跳超时检测 (30秒)
- ✓ CORS 保护

---

## 5. 状态机 (App 端)

```
┌──────────────┐
│ disconnected │ 未连接 Broker
└──────┬───────┘
       │ connectToBroker()
       ▼
┌──────────────┐
│ connecting   │ 正在连接...
└──────┬───────┘
       │ 连接成功
       ▼
┌──────────────┐
│ not_paired   │ 已连接但未配对
└──────┬───────┘
       │ 输入配对码成功
       ▼
┌──────────────┐
│ paired       │ 已配对，Runner 在线
└──────┬───────┘
       │ Runner 离线
       ▼
┌──────────────┐
│ runner_offline│ Runner 已离线
└──────┬───────┘
       │ Runner 重新上线
       ▼
┌──────────────┐
│ paired       │ 恢复配对状态
└──────┬───────┘
       │ 点击 "Start Session"
       ▼
┌──────────────┐
│ session_active│ 会话活跃中
└──────┬───────┘
       │ 会话结束
       ▼
┌──────────────┐
│ paired       │ 返回配对状态
└──────────────┘
```

---

## 6. 时序图 (Sequence Diagram)

```
App          Broker           Redis          Runner
│             │                │              │
│ connect     │                │              │
├────────────►│                │              │
│             │                │              │
│             │                │              │ register
│             │                │◄─────────────┤
│             │                │              │
│             │                │              │ heartbeat (每10s)
│             │                │◄─────────────┤
│             │                │              │
│──────────────────────────────────────────────│
│             │                │              │
│ pair(code)  │                │              │
├────────────►│                │              │
│             │ validate code  │              │
│             ├───────────────►│              │
│             │ valid?         │              │
│             │◄───────────────┤              │
│             │                │              │
│             │ check online   │              │
│             ├───────────────►│              │
│             │ online?        │              │
│             │◄───────────────┤              │
│             │                │              │
│             │ create session │              │
│             ├───────────────►│              │
│             │                │              │
│◄────────────┤ success        │              │
│             │                │              │
│──────────────────────────────────────────────│
│             │                │              │
│ connect_runner               │              │
├────────────►│                │              │
│             │ verify pairing │              │
│             ├───────────────►│              │
│             │ paired?        │              │
│             │◄───────────────┤              │
│             │                │              │
│             │ create session │              │
│             │                ├─────────────►│
│             │                │              │
│◄────────────┤ session_created              │
│             │                │              │
│──────────────────────────────────────────────│
│             │                │              │
│ input("ls") │                │              │
├────────────►│                │              │
│             │                ├─────────────►│
│             │                │              │
│             │                │              │ output
│             │                │◄─────────────┤
│             │ output         │              │
│◄────────────┤                │              │
│             │                │              │
```

---

## 7. 错误处理流程

### 配对失败
```
App 输入配对码
    │
    ├─► 格式错误 ──► "Invalid format (XXX-XXX-XXX)"
    │
    ├─► 配对码不存在 ──► "Pairing code not found"
    │
    ├─► 配对码过期 ──► "Pairing code has expired"
    │
    ├─► Runner 离线 ──► "Runner is currently offline"
    │
    └─► 频率限制 ──► "Too many attempts. Try again in X seconds"
```

### 连接失败
```
Runner 连接 Broker
    │
    ├─► 网络错误 ──► 指数退避重试 (1s, 2s, 4s, ..., 30s)
    │
    ├─► 密钥错误 ──► "Invalid runner secret" (致命错误)
    │
    └─► 配对码冲突 ──► 生成新配对码重试 (最多3次)
```

### 会话失败
```
App 连接 Runner
    │
    ├─► 未配对 ──► "Not paired with this runner"
    │
    ├─► Runner 离线 ──► "Runner not found or offline"
    │
    └─► 会话已存在 ──► 复用现有会话
```

---

## 8. 性能优化

### 8.1 连接复用
- App 使用单例模式 (`app-client-singleton.ts`)
- Socket 连接跨页面共享
- 避免重复连接

### 8.2 输出去重
- 终端输出使用 `sessionId` 去重
- 避免重复写入

### 8.3 心跳优化
- Runner 每10秒发送心跳
- Redis TTL 30秒
- 允许3次心跳丢失

### 8.4 内存管理
- 会话结束后清理 Map
- 断线时清理 socket 映射
- PTY 进程正确关闭

---

## 9. 监控指标

### Broker 端
- 活跃 Runner 数量
- 活跃 App 数量
- 活跃会话数量
- 配对成功率
- 平均配对时间

### Runner 端
- 连接状态
- 心跳延迟
- PTY 会话数量
- CPU/内存使用率

### App 端
- 连接状态
- 配对状态
- 会话状态
- 终端输出延迟

---

## 10. 部署架构

```
┌─────────────────────────────────────────────────┐
│              ECS Server (云主机)                 │
│                                                 │
│  ┌─────────────┐      ┌─────────────┐          │
│  │  Docker 1   │      │  Docker 2   │          │
│  │             │      │             │          │
│  │  Broker     │      │   Redis     │          │
│  │  Port: 3000 │      │  Port: 6379 │          │
│  └─────────────┘      └─────────────┘          │
│                                                 │
│  PM2 Process Manager                            │
│  - 自动重启                                     │
│  - 日志管理                                     │
│  - 监控告警                                     │
└─────────────────────────────────────────────────┘
         │
         │ WebSocket (wss://115.191.40.55:3000)
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌───▼────┐
│ App   │ │ Runner │
│       │ │        │
│ iOS   │ │ macOS  │
│ Android│ │ Linux  │
│ Web   │ │ Windows│
└───────┘ └────────┘
```

---

## 总结

这是一个完整的远程终端执行系统，通过以下关键技术实现:

1. **安全配对**: 9字符配对码 + 10分钟过期 + 频率限制
2. **实时通信**: WebSocket 双向通信
3. **跨平台**: React Native + xterm.js
4. **状态管理**: Redis 持久化 + 心跳机制
5. **错误恢复**: 指数退避重试 + 自动重连
6. **单例模式**: 连接复用 + 资源共享

整个系统设计精良，代码结构清晰，是一个生产级别的远程终端解决方案。

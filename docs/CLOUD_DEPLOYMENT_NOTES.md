# 云端 Broker 部署迁移笔记

> 文档创建时间: 2026-01-28  
> 云端 Broker IP: `115.191.40.55`

## 📋 概述

本文档记录了将 Broker 服务部署到云端后，本地 Runner 和 App 需要进行的配置修改，以及在此过程中遇到的问题和解决方案。

---

## 🔧 配置修改

### 1. 更新的文件列表

| 文件路径                     | 修改内容                                          |
| ---------------------------- | ------------------------------------------------- |
| `test-auth.js`               | Broker URL: `localhost` → `115.191.40.55`         |
| `test-full-chain.js`         | Broker URL: `localhost` → `115.191.40.55`         |
| `runner/src/config.ts`       | 默认 Broker URL: `localhost` → `115.191.40.55`    |
| `runner/src/cli.ts`          | 帮助信息中的默认 URL                              |
| `app/src/services/socket.ts` | 所有平台统一使用云端地址，添加 WebSocket 传输配置 |

### 2. App Socket.io 配置关键修改

```typescript
// app/src/services/socket.ts

// 直接使用云端 broker 地址
const BROKER_URL = "http://115.191.40.55:3000";

// Socket.io 连接配置
this.socket = io(BROKER_URL, {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  // ⚠️ 关键：强制使用 WebSocket，禁用 xhr polling
  transports: ["websocket"],
});
```

---

## 🐛 遇到的问题及解决方案

### 问题 1: `xhr poll error`

**错误信息:**

```
(NOBRIDGE) ERROR  ❌ Socket.io connection error: [Error: xhr poll error]
```

**原因:**
React Native 对 Socket.io 的默认 XHR 轮询 (polling) 支持有问题。当 Socket.io 尝试使用 HTTP 长轮询作为传输方式时会失败。

**解决方案:**
在 Socket.io 连接配置中强制使用 WebSocket：

```typescript
this.socket = io(BROKER_URL, {
  transports: ["websocket"], // 只使用 WebSocket，禁用 polling
});
```

---

### 问题 2: `posix_spawnp failed`

**错误信息:**

```
❌ Failed to spawn PTY: Error: posix_spawnp failed.
```

**原因:**
`node-pty` 包的预编译二进制文件 `spawn-helper` 缺少可执行权限。这通常发生在 npm 安装时权限未正确保留的情况下。

**解决方案:**
手动为 `spawn-helper` 添加可执行权限：

```bash
chmod +x node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper
```

**永久修复建议:**
在 `runner/package.json` 中添加 postinstall 脚本：

```json
{
  "scripts": {
    "postinstall": "chmod +x node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper 2>/dev/null || true"
  }
}
```

---

## ✅ 验证步骤

### 1. 测试网络连通性

```bash
# 测试云端 Broker 是否可访问
curl -v http://115.191.40.55:3000 --connect-timeout 5
```

预期结果：返回 HTTP 404（表示服务运行中，只是根路径没有处理器）

### 2. 测试 Socket.io 认证

```bash
# 在项目根目录运行
node test-auth.js
```

预期结果：

```
Connecting...
✅ Connected, sending auth...
✅ Authenticated successfully: { userId: 'demo-user', runners: [...] }
```

### 3. 测试 node-pty

```bash
cd runner
node -e "const pty = require('node-pty'); \
  const p = pty.spawn('/bin/bash', [], { \
    name: 'xterm-256color', cols: 80, rows: 24, \
    cwd: process.env.HOME, env: process.env \
  }); \
  p.onData(d => console.log('OK:', d.substring(0,30))); \
  setTimeout(() => { p.kill(); process.exit(0); }, 1000);"
```

预期结果：显示 shell 提示符内容

### 4. 启动 Runner 并连接云端

```bash
cd runner
npm run dev
```

预期结果：

```
🚀 Starting Runner...
   Runner ID: runner-1
   Broker URL: http://115.191.40.55:3000
🔌 Connecting to broker: http://115.191.40.55:3000
✅ Connected to broker
✅ Runner registered: runner-1
```

### 5. 启动 App 并测试

```bash
cd app
npm start
```

预期结果（在 Expo 日志中）：

```
🌐 Broker URL: http://115.191.40.55:3000
🌐 Socket.io connected to Broker
✅ App authenticated successfully: {"runners": ["runner-1"], "userId": "demo-user"}
🚀 Session created and active: session-xxxxx
```

---

## 🔒 安全注意事项

1. **防火墙配置**: 确保云服务器的 3000 端口已开放（入站规则）
2. **CORS 配置**: Broker 已配置 `origin: '*'`，生产环境建议限制为特定域名
3. **认证机制**: 当前使用演示 token (`demo-token`)，生产环境需要实现真正的 JWT 认证

---

## 📁 项目架构回顾

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   Mobile App    │◀───────▶│     Broker      │◀───────▶│     Runner      │
│   (React Native)│  WebSocket│  (云端 NestJS) │  WebSocket│  (本地 Node.js)│
│  115.191.40.55  │         │  115.191.40.55  │         │   localhost     │
│     :8081       │         │     :3000       │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
                                    │
                                    ▼
                            ┌─────────────────┐
                            │   云端服务器    │
                            │ 115.191.40.55   │
                            └─────────────────┘
```

---

## 📝 命令速查

```bash
# 启动 Runner（连接云端 Broker）
cd runner && npm run dev

# 启动 App
cd app && npm start

# 测试认证
node test-auth.js

# 测试完整链路
node test-full-chain.js

# 修复 node-pty 权限问题
chmod +x runner/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper
```

---

## 🎯 关键经验总结

1. **React Native + Socket.io**: 必须使用 `transports: ['websocket']`，不能依赖默认的 polling
2. **node-pty 权限**: 预编译二进制可能丢失可执行权限，需要手动修复
3. **跨平台地址统一**: 部署到云端后，所有客户端都应使用云端 IP，简化了配置逻辑
4. **调试顺序**: 网络连通性 → Socket.io 连接 → PTY 创建 → 终端交互

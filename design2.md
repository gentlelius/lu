
# 优化设计文档：远程操控 Claude Code 系统

## 1. 概述
本系统旨在通过移动端 App 远程控制运行在私有环境（如本地电脑、内网服务器）中的 Claude Code CLI。
**核心优化点：** 1. 采用 **Runner 主动连接 Broker** 的反向架构，无需在 Runner 端配置公网 IP 或防火墙端口。
2. 引入 `node-pty` 支持全双工终端交互（不仅是发命令，还能处理 `y/n` 确认和方向键）。
3. 增加会话保持与断线重连机制。

## 2. 系统架构

### 2.1 总体架构图 (反向连接模式)

```text
+-----------------------+           +-----------------------+
|      Mobile App       |           |      Runner 服务      |
| (Expo / React Native) |           | (Node.js + node-pty)  |
+-----------------------+           +-----------------------+
          |                                     |
          | WebSocket (WSS)                     | WebSocket (WSS)
          | (Client)                            | (Client)
          v                                     v
+-------------------------------------------------------+
|                      Broker 服务                      |
|                  (NestJS + Socket.io)                 |
|            --------------------------------           |
|            负责信令交换、鉴权、管道转发               |
+-------------------------------------------------------+

```

### 2.2 核心流程

1. **Runner 启动**：Runner 启动后，主动向 Broker 发起 WebSocket 连接，并注册自己（携带 Runner ID / Secret）。
2. **App 连接**：用户打开 App，连接 Broker 并通过 JWT 鉴权。
3. **会话建立**：App 请求连接指定的 Runner，Broker 在两者之间建立虚拟的数据管道。
4. **交互执行**：App 发送的按键流实时转发给 Runner 的 PTY；PTY 的屏幕输出实时转发回 App。

## 3. 功能需求

### 3.1 核心功能

* **全双工终端模拟**：支持标准输入（Stdin）流式发送，支持 ANSI 颜色编码解析（让 Claude Code 的输出在手机上显示颜色）。
* **交互式确认**：能够处理 Claude Code 的 "Allow this command? (y/n)" 等交互场景。
* **断线重连**：App 网络切换导致断开后，重新连接能恢复之前的终端上下文（通过回放最近 N 行日志或缓存）。
* **OAuth 拦截**：自动识别 Claude Code 输出中的登录 URL，并在手机端提示用户打开。

## 4. 技术选型

### 4.1 移动端应用（App）

* **框架**：Expo (React Native)
* **终端组件**：使用 `xterm.js` 的 React Native 适配版（或简单的 `FlatList` 渲染带颜色的文本），以支持 ANSI 转义序列。

### 4.2 中控服务（Broker）

* **框架**：NestJS
* **通信库**：`Socket.io` (推荐) 或 `ws`。Socket.io 内置了 Room 概念和重连机制，非常适合这种消息转发场景。
* **职责**：纯粹的“消息路由器”，不存储业务逻辑，只负责验证身份和转发数据包。

### 4.3 执行服务（Runner）

* **运行环境**：Node.js
* **核心库**：**`node-pty`** (微软官方维护，VS Code 底层使用的库)。
* *理由*：`pty.js` 已停止维护，`node-pty` 稳定性更强，支持 Windows/Linux/macOS 跨平台，且能完美模拟 TTY 尺寸（Rows/Cols）。


* **进程管理**：使用 `pm2` 或 `Docker` 运行 Runner，确保服务常驻。

## 5. 详细模块设计

### 5.1 通信协议设计 (WebSocket Payload)

定义明确的 JSON 数据包格式，用于 App 和 Runner 之间的通信。

**数据包结构示例：**

```json
{
  "event": "terminal_data", // 事件类型：terminal_data, terminal_resize, handshake
  "payload": {
    "sessionId": "uuid-1234",
    "data": "raw text or base64", // 终端输出内容或用户输入
    "cols": 80, // 仅在 resize 事件中使用
    "rows": 24
  }
}

```

### 5.2 Runner 服务逻辑 (`node-pty`)

Runner 需要维护一个 PTY 进程池。

```javascript
// 伪代码逻辑
const pty = require('node-pty');

// 启动 Claude Code
const ptyProcess = pty.spawn('claude', [], {
  name: 'xterm-color',
  cols: 80,
  rows: 30,
  cwd: process.env.HOME,
  env: process.env
});

// 监听输出 -> 发送给 Broker -> 转发给 App
ptyProcess.onData((data) => {
  socket.emit('output', { data: data });
});

// 接收 Broker (App) 的输入 -> 写入 PTY
socket.on('input', (input) => {
  ptyProcess.write(input);
});

```

### 5.3 移动端交互设计

* **虚拟键盘栏**：在底部提供快捷键栏，包含 `Yes`, `No`, `Enter`, `Ctrl+C`, `Up`, `Down` 等常用控制键，方便与 Claude Code 交互。
* **尺寸同步**：监听手机屏幕方向变化，发送 `resize` 事件给 Runner，动态调整终端宽窄，防止输出换行错乱。

## 6. 安全设计 (Security)

### 6.1 通信安全

* **WSS/HTTPS**：强制使用 SSL 加密传输。
* **Token 鉴权**：
* App 连接 Broker 使用 User JWT。
* Runner 连接 Broker 使用预分配的 API Key (Machine Token)。



### 6.2 执行环境隔离 (关键)

鉴于 Claude Code 可以执行任意系统命令，白名单机制难以维护且不安全。

* **建议方案**：**沙盒化运行 (Docker)**。
* **实现**：Runner 不直接在宿主机运行 `claude`，而是每当开启一个新会话时，启动一个临时的 Docker 容器运行 Claude Code。会话结束后销毁容器。
* *优点*：即使 Claude Code 删除了根目录，也只是删除了容器内部，宿主机安全无忧。



### 6.3 敏感信息脱敏

* Broker 端尽量不记录详细日志（不落库），防止代码或 Token 泄露在服务器日志中。

## 7. 异常处理

* **Runner 离线**：Broker 需感知 Runner 的 WebSocket 断开，并立即通知 App 端展示“设备离线”。
* **进程僵死**：Runner 需监控 PTY 子进程状态，如果 Claude CLI 异常退出，需自动重启或通知前端。


# Claude Remote

远程终端执行系统，由 Broker（中心服务器）和 Runner（客户端 CLI）组成。

## 项目结构

```
.
├── broker/          # 中心服务器（部署到 ECS）
├── runner/          # CLI 工具（发布到 npm）
└── app/             # 移动端应用
```

## 快速开始

### 本地开发

```bash
# 启动 Broker
cd broker
npm install
npm run dev

# 测试 Runner
cd runner
npm install
npm run build
npm link
claude-runner --url http://localhost:3000 --id test --secret secret-runner-1
```

### 生产部署

详细步骤请查看：
- [快速开始指南](./QUICK_START.md)
- [完整部署文档](./DEPLOYMENT.md)

## 部署架构

```
┌─────────────────┐
│   ECS Server    │
│                 │
│  ┌───────────┐  │
│  │  Broker   │  │ ← PM2 管理
│  │  (NestJS) │  │
│  └─────┬─────┘  │
│        │        │
└────────┼────────┘
         │
    WebSocket
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼────┐
│Runner │ │Runner │
│ CLI   │ │ CLI   │
└───────┘ └───────┘
```

## 核心功能

- ✅ WebSocket 实时通信
- ✅ JWT 认证
- ✅ PTY 终端管理
- ✅ PM2 进程管理
- ✅ CLI 工具封装

## 技术栈

- **Broker**: NestJS + Socket.IO + JWT
- **Runner**: Node.js + node-pty + Socket.IO Client
- **部署**: PM2 + ECS

## 文档

- [快速开始](./QUICK_START.md) - 5 分钟快速上手
- [部署文档](./DEPLOYMENT.md) - 完整部署指南
- [Runner README](./runner/README.md) - CLI 使用文档

## License

MIT

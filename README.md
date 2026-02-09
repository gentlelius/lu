# Cli Remote

远程终端执行系统，支持通过配对码安全连接 Runner 和 App。

## 项目结构

```
.
├── broker/          # 中心服务器（NestJS + Socket.IO + Redis）
├── runner/          # CLI 工具（Node.js + node-pty）
├── app/             # 移动端应用（React Native + Expo）
└── docs/            # 完整文档
```

## ✨ 核心功能

- 🔐 **安全配对系统** - 使用配对码进行安全连接
- 🔄 **实时终端** - WebSocket 实时通信
- 📱 **移动端支持** - React Native App
- 🔒 **JWT 认证** - 安全的身份验证
- 💾 **Redis 存储** - 配对关系和会话管理
- 🚀 **PM2 管理** - 生产级进程管理

## 🚀 快速开始

### 方式 1：一键部署（推荐）

```bash
# 在服务器上执行
cd broker
./quick-deploy.sh
```

自动完成：Redis 安装、配置、构建、启动

### 方式 2：分步部署

```bash
# 1. 配置 Redis
cd broker
./setup-redis.sh

# 2. 配置环境变量
cp .env.example .env
nano .env  # 设置 REDIS_PASSWORD 等

# 3. 启动服务
npm install
npm run build
pm2 start ecosystem.config.js
```

### 方式 3：本地开发

```bash
# 1. 启动 Redis
docker run -d -p 6379:6379 redis:7-alpine

# 2. 启动 Broker
cd broker
npm install
npm run dev

# 3. 测试 Runner
cd runner
npm install
npm run build
npm link
claude-runner --url http://localhost:3000 --id test --secret secret-runner-1
```

## 📚 文档

### 部署文档
- 📖 [快速部署指南](./docs/QUICK_START_DEPLOYMENT.md) - 5 分钟快速部署
- 📖 [完整部署指南](./docs/DEPLOYMENT_GUIDE.md) - 详细的部署和配置说明
- 📖 [部署总结](./docs/DEPLOYMENT_SUMMARY.md) - 三种部署方式对比

### 安全文档
- 🔒 [安全修复说明](./docs/SECURITY_FIX_COMPLETED.md) - 配对验证安全修复
- 🔒 [安全漏洞分析](./docs/SECURITY_VULNERABILITY_FIX.md) - 漏洞详情和修复方案

### 使用文档
- 📱 [使用指南](./docs/how-to-use.md) - 如何使用系统
- 🏃 [Runner README](./runner/README.md) - CLI 工具文档

## 🏗️ 系统架构

```
┌─────────────────────────────────────┐
│         ECS Server / Cloud          │
│                                     │
│  ┌──────────┐      ┌────────────┐  │
│  │  Broker  │◄────►│   Redis    │  │
│  │ (NestJS) │      │ (配对/会话) │  │
│  └────┬─────┘      └────────────┘  │
│       │                             │
└───────┼─────────────────────────────┘
        │
   WebSocket (配对验证)
        │
    ┌───┴────┐
    │        │
┌───▼───┐ ┌─▼────┐
│Runner │ │ App  │
│ CLI   │ │(RN)  │
└───────┘ └──────┘
```

### 配对流程

1. **Runner 启动** → 生成配对码 → 显示给用户
2. **App 输入配对码** → Broker 验证 → 建立配对关系
3. **App 连接 Runner** → Broker 验证配对 → 允许终端访问

## 🔧 技术栈

### Broker (中心服务器)
- **框架**: NestJS
- **通信**: Socket.IO (WebSocket)
- **认证**: JWT
- **存储**: Redis (ioredis)
- **部署**: PM2

### Runner (CLI 工具)
- **运行时**: Node.js
- **终端**: node-pty
- **通信**: Socket.IO Client
- **配对**: 自动生成配对码

### App (移动端)
- **框架**: React Native + Expo
- **终端**: xterm.js
- **通信**: Socket.IO Client
- **UI**: React Native Paper

## 🔒 安全特性

- ✅ **配对验证** - 只有配对的 App 可以连接 Runner
- ✅ **JWT 认证** - 所有连接都需要认证
- ✅ **Redis 密码** - 数据存储加密保护
- ✅ **速率限制** - 防止暴力破解配对码
- ✅ **配对码过期** - 配对码 10 分钟自动过期
- ✅ **安全日志** - 记录所有安全违规尝试

## 📊 环境变量配置

### Broker (.env)

```env
# 服务器配置
PORT=3000
NODE_ENV=production

# JWT 密钥（生成: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"）
JWT_SECRET=your-random-secret-key

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DB=0

# Runner 认证（格式: RUNNER_<ID>=<SECRET>）
RUNNER_runner-1=secret-runner-1
RUNNER_my-laptop=my-secure-secret

# CORS 配置
CORS_ORIGINS=*
```

### Runner

```bash
# 命令行参数
claude-runner \
  --url http://your-server:3000 \
  --id runner-1 \
  --secret secret-runner-1

# 或使用环境变量
export BROKER_URL=http://your-server:3000
export RUNNER_ID=runner-1
export RUNNER_SECRET=secret-runner-1
claude-runner
```

## 🛠️ 运维命令

### PM2 管理

```bash
pm2 status                          # 查看状态
pm2 logs claude-remote-broker       # 查看日志
pm2 restart claude-remote-broker    # 重启服务
pm2 monit                           # 监控
```

### Redis 管理

```bash
redis-cli -a your-password ping     # 测试连接
redis-cli -a your-password          # 连接 Redis
> KEYS pairing:*                    # 查看配对信息
> KEYS runner:heartbeat:*           # 查看 runner 心跳
```

### 健康检查

```bash
# 测试 Broker
curl http://localhost:3000

# 测试 Redis
redis-cli -a your-password ping

# 查看日志
pm2 logs claude-remote-broker --lines 50
```

## 🐛 故障排查

### Redis 连接失败
```bash
# 检查 Redis 状态
sudo systemctl status redis-server

# 测试连接
redis-cli -a your-password ping

# 查看 .env 配置
cat .env | grep REDIS
```

### Broker 启动失败
```bash
# 查看详细日志
pm2 logs claude-remote-broker --lines 100

# 检查端口占用
sudo lsof -i :3000

# 手动启动查看错误
node dist/main.js
```

### 配对失败
```bash
# 检查配对码
redis-cli -a your-password
> KEYS pairing:code:*
> GET pairing:code:ABC-DEF-GHI

# 检查 runner 心跳
> KEYS runner:heartbeat:*
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

MIT

## 🙏 致谢

感谢所有贡献者和使用者！

---

**需要帮助？** 查看 [完整文档](./docs/) 或提交 Issue。

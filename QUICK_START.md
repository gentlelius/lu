# 快速开始指南

## 本地测试

### 1. 启动 Broker

```bash
cd broker
pnpm install
pnpm build
pnpm dev
```

### 2. 测试 Runner CLI

```bash
cd runner
pnpm install
pnpm build
npm link

# 运行
claude-runner --url http://localhost:3000 --id test-runner --secret secret-runner-1
```

---

## 生产部署

### 1. 部署 Broker 到 ECS

#### 一键部署脚本

```bash
# 在 ECS 上
cd /opt/claude-remote/broker
chmod +x start.sh
./start.sh
```

#### 手动部署

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env
nano .env

# 3. 构建
pnpm build

# 4. 启动
pnpm pm2:start

# 5. 设置开机自启
pm2 startup
pm2 save
```

### 2. 发布 Runner CLI

```bash
cd runner

# 构建
pnpm build

# 发布到 npm
npm publish
```

### 3. 使用 Runner

```bash
# 安装
npm install -g claude-remote-runner

# 配置
echo "BROKER_URL=http://your-ecs-ip:3000
RUNNER_ID=my-laptop
RUNNER_SECRET=my-secret" > ~/.claude-runner.env

# 运行
claude-runner
```

---

## 常用命令

### Broker 管理

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs claude-remote-broker

# 重启
pm2 restart claude-remote-broker

# 停止
pm2 stop claude-remote-broker

# 监控
pm2 monit
```

### Runner 使用

```bash
# 查看帮助
claude-runner --help

# 使用配置文件
claude-runner

# 使用命令行参数
claude-runner --url http://broker.com:3000 --id my-runner --secret my-secret
```

---

## 故障排查

### Broker 无法启动

```bash
# 检查日志
pm2 logs claude-remote-broker --lines 50

# 检查端口
lsof -i :3000

# 检查环境变量
pm2 show claude-remote-broker
```

### Runner 无法连接

```bash
# 测试网络连接
curl http://your-ecs-ip:3000

# 检查防火墙
# 阿里云: 在控制台安全组中开放 3000 端口
```

---

## 下一步

详细文档请查看 [DEPLOYMENT.md](./DEPLOYMENT.md)

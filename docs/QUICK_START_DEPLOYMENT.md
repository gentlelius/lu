# 快速部署指南

## 🚀 5 分钟快速部署

### 前提条件
- 一台 Linux 服务器（Ubuntu/Debian/CentOS）
- SSH 访问权限
- Node.js 18+ 已安装

### 方法 1：一键部署（推荐）

```bash
# 1. SSH 登录到服务器
ssh user@your-server-ip

# 2. 克隆代码
git clone <your-repo-url> /opt/cli-remote
cd /opt/cli-remote/broker

# 3. 运行一键部署脚本
chmod +x quick-deploy.sh
./quick-deploy.sh
```

脚本会自动：
- ✅ 安装 Redis
- ✅ 安装 PM2
- ✅ 配置环境变量
- ✅ 构建项目
- ✅ 启动服务

### 方法 2：分步部署

#### 步骤 1：安装 Redis

```bash
cd /opt/cli-remote/broker
chmod +x setup-redis.sh
./setup-redis.sh
```

记录输出的 Redis 密码！

#### 步骤 2：配置环境变量

```bash
cp .env.example .env
nano .env
```

修改以下配置：
```env
# Redis 配置（使用 setup-redis.sh 输出的密码）
REDIS_PASSWORD=your-redis-password

# JWT 密钥（生成随机密钥）
JWT_SECRET=your-random-secret

# Runner 密钥
RUNNER_runner-1=your-runner-secret
```

生成随机密钥：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 步骤 3：构建和启动

```bash
# 安装依赖
npm install

# 构建
npm run build

# 启动
pm2 start ecosystem.config.js
pm2 save
```

### 方法 3：使用 Docker（最简单）

```bash
# 1. 安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 2. 启动 Redis
docker run -d \
  --name redis \
  --restart always \
  -p 6379:6379 \
  redis:7-alpine \
  redis-server --requirepass "your-redis-password"

# 3. 配置 .env
cp .env.example .env
nano .env
# 设置 REDIS_PASSWORD=your-redis-password

# 4. 启动 Broker
npm install
npm run build
pm2 start ecosystem.config.js
```

---

## ✅ 验证部署

### 1. 检查服务状态

```bash
# 查看 PM2 状态
pm2 status

# 查看日志
pm2 logs cli-remote-broker --lines 20
```

应该看到：
- ✅ "Redis connected"
- ✅ "Redis ready"
- ✅ "Nest application successfully started"

### 2. 测试连接

```bash
# 测试 HTTP
curl http://localhost:3000

# 测试 Redis
redis-cli -a your-redis-password ping
# 应该返回: PONG
```

### 3. 测试配对功能

在另一台机器上启动 runner：
```bash
npm install -g cli-remote-runner
claude-runner --url http://your-server-ip:3000 --id test-runner --secret test-secret
```

应该看到配对码显示。

---

## 🔧 常用命令

### PM2 管理

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs cli-remote-broker

# 重启
pm2 restart cli-remote-broker

# 停止
pm2 stop cli-remote-broker

# 监控
pm2 monit
```

### Redis 管理

```bash
# 连接 Redis
redis-cli -a your-redis-password

# 查看所有 key
KEYS *

# 查看配对信息
KEYS pairing:*

# 查看 runner 心跳
KEYS runner:heartbeat:*
```

---

## 🔒 安全配置

### 1. 配置防火墙

```bash
# Ubuntu/Debian
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 3000/tcp    # Broker
sudo ufw enable

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=22/tcp
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

### 2. 配置云服务商安全组

在云服务商控制台开放端口：
- 22 (SSH)
- 3000 (Broker)

### 3. 使用强密码

```bash
# 生成强密码
openssl rand -base64 32
```

---

## 📊 监控和维护

### 设置开机自启

```bash
pm2 startup
# 执行输出的命令
pm2 save
```

### 日志轮转

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 健康检查

创建 cron 任务：
```bash
crontab -e
```

添加：
```cron
# 每 5 分钟检查一次
*/5 * * * * curl -f http://localhost:3000 || pm2 restart cli-remote-broker
```

---

## 🆘 故障排查

### Redis 连接失败

```bash
# 检查 Redis 状态
sudo systemctl status redis-server

# 测试连接
redis-cli -a your-redis-password ping

# 查看日志
sudo journalctl -u redis-server -n 50
```

### Broker 启动失败

```bash
# 查看详细日志
pm2 logs cli-remote-broker --lines 100

# 检查端口占用
sudo lsof -i :3000

# 手动启动查看错误
cd /opt/cli-remote/broker
node dist/main.js
```

### 配对失败

```bash
# 检查 Redis 中的配对码
redis-cli -a your-redis-password
> KEYS pairing:code:*
> GET pairing:code:ABC-DEF-GHI

# 检查 runner 心跳
> KEYS runner:heartbeat:*
```

---

## 📚 更多信息

- 完整部署指南：[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- 安全修复说明：[SECURITY_FIX_COMPLETED.md](./SECURITY_FIX_COMPLETED.md)
- 使用说明：[how-to-use.md](./how-to-use.md)

---

## 🎉 部署成功！

现在你可以：
1. 在客户端机器上安装 runner
2. 使用 app 进行配对
3. 开始使用远程终端

需要帮助？查看完整文档或联系技术支持。

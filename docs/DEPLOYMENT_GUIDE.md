# 完整部署指南

## 目录
1. [Redis 安装和配置](#1-redis-安装和配置)
2. [Broker 部署](#2-broker-部署)
3. [安全配置](#3-安全配置)
4. [验证部署](#4-验证部署)
5. [故障排查](#5-故障排查)

---

## 1. Redis 安装和配置

### 1.1 在 ECS 上安装 Redis

#### 方法 A：使用包管理器（推荐）

**Ubuntu/Debian:**
```bash
# 更新包列表
sudo apt update

# 安装 Redis
sudo apt install redis-server -y

# 启动 Redis
sudo systemctl start redis-server

# 设置开机自启
sudo systemctl enable redis-server

# 检查状态
sudo systemctl status redis-server
```

**CentOS/RHEL:**
```bash
# 安装 EPEL 仓库
sudo yum install epel-release -y

# 安装 Redis
sudo yum install redis -y

# 启动 Redis
sudo systemctl start redis

# 设置开机自启
sudo systemctl enable redis

# 检查状态
sudo systemctl status redis
```

#### 方法 B：使用 Docker（推荐用于开发）

```bash
# 安装 Docker（如果还没安装）
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 运行 Redis 容器
docker run -d \
  --name redis \
  --restart always \
  -p 6379:6379 \
  -v /data/redis:/data \
  redis:7-alpine \
  redis-server --appendonly yes --requirepass "your-redis-password"

# 检查状态
docker ps | grep redis
```

### 1.2 配置 Redis

#### 编辑 Redis 配置文件

```bash
# Ubuntu/Debian
sudo nano /etc/redis/redis.conf

# CentOS/RHEL
sudo nano /etc/redis.conf
```

#### 重要配置项

```conf
# 1. 绑定地址（生产环境建议只绑定内网 IP）
bind 127.0.0.1

# 如果 Broker 和 Redis 在不同机器，需要绑定内网 IP
# bind 127.0.0.1 10.0.0.5

# 2. 设置密码（强烈推荐）
requirepass your-strong-redis-password-here

# 3. 持久化配置
# RDB 快照
save 900 1      # 900 秒内至少 1 个 key 变化
save 300 10     # 300 秒内至少 10 个 key 变化
save 60 10000   # 60 秒内至少 10000 个 key 变化

# AOF 持久化（推荐开启）
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec

# 4. 内存配置
maxmemory 256mb
maxmemory-policy allkeys-lru

# 5. 日志
loglevel notice
logfile /var/log/redis/redis-server.log

# 6. 数据库数量
databases 16
```

#### 重启 Redis 使配置生效

```bash
# Ubuntu/Debian
sudo systemctl restart redis-server

# CentOS/RHEL
sudo systemctl restart redis

# Docker
docker restart redis
```

### 1.3 测试 Redis 连接

```bash
# 无密码连接
redis-cli ping
# 应该返回: PONG

# 有密码连接
redis-cli -a your-redis-password ping
# 应该返回: PONG

# 测试基本操作
redis-cli -a your-redis-password
> SET test "hello"
> GET test
> DEL test
> QUIT
```

### 1.4 Redis 安全加固

```bash
# 1. 创建专用用户（如果使用系统安装）
sudo useradd -r -s /bin/false redis

# 2. 设置文件权限
sudo chown -R redis:redis /var/lib/redis
sudo chmod 750 /var/lib/redis

# 3. 配置防火墙（只允许本地或内网访问）
sudo ufw allow from 127.0.0.1 to any port 6379
# 或允许特定内网 IP
sudo ufw allow from 10.0.0.0/24 to any port 6379

# 4. 禁用危险命令（在 redis.conf 中）
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command CONFIG ""
```

---

## 2. Broker 部署

### 2.1 准备环境

```bash
# 1. 安装 Node.js 20+
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# 2. 安装 PM2
npm install -g pm2

# 3. 安装 pnpm（可选，如果使用 monorepo）
npm install -g pnpm

# 4. 创建部署目录
sudo mkdir -p /opt/claude-remote
sudo chown $USER:$USER /opt/claude-remote
```

### 2.2 部署代码

#### 方法 A：使用部署脚本（推荐）

```bash
# 在本地机器上

# 1. 编辑部署脚本配置
nano broker/deploy-to-ecs.sh

# 修改以下配置：
# ECS_HOST="your-ecs-ip"
# ECS_USER="your-username"
# ECS_PATH="/opt/claude-remote"

# 2. 执行部署
cd broker
chmod +x deploy-to-ecs.sh
./deploy-to-ecs.sh
```

#### 方法 B：手动部署

```bash
# 在 ECS 上

# 1. 克隆代码
cd /opt
git clone <your-repo-url> claude-remote
cd claude-remote/broker

# 或使用 rsync 从本地上传
# rsync -avz --exclude 'node_modules' ./ user@ecs-ip:/opt/claude-remote/broker/

# 2. 安装依赖
npm install

# 3. 构建
npm run build
```

### 2.3 配置环境变量

```bash
cd /opt/claude-remote/broker

# 1. 复制环境变量模板
cp .env.example .env

# 2. 编辑配置
nano .env
```

#### 完整的 .env 配置示例

```env
# ========== 服务器配置 ==========
PORT=3000
NODE_ENV=production

# ========== JWT 配置 ==========
# 生成强密钥: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your-random-secret-key-change-this-to-a-long-random-string

# ========== Redis 配置 ==========
# Redis 服务器地址
REDIS_HOST=localhost
# 如果 Redis 在其他机器: REDIS_HOST=10.0.0.5

# Redis 端口
REDIS_PORT=6379

# Redis 密码（如果设置了）
REDIS_PASSWORD=your-redis-password

# Redis 数据库编号（0-15）
REDIS_DB=0

# ========== Runner 认证配置 ==========
# 格式: RUNNER_<ID>=<SECRET>
# 每个 runner 需要一个唯一的 ID 和密钥
RUNNER_runner-1=secret-runner-1-change-this
RUNNER_my-laptop=my-secure-secret-change-this
RUNNER_office-pc=office-secret-change-this

# ========== CORS 配置 ==========
# 允许的来源（逗号分隔）
# 开发环境可以用 *，生产环境应该指定具体域名
CORS_ORIGINS=*
# 生产环境示例:
# CORS_ORIGINS=https://your-app.com,https://another-app.com

# ========== 日志配置 ==========
LOG_LEVEL=info
```

### 2.4 生成安全密钥

```bash
# 生成 JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 生成 RUNNER_SECRET
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

### 2.5 创建启动脚本

创建 `/opt/claude-remote/broker/start.sh`:

```bash
#!/bin/bash

set -e

echo "🚀 启动 Claude Remote Broker..."

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    exit 1
fi

# 检查 PM2
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 未安装，正在安装..."
    npm install -g pm2
fi

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "❌ .env 文件不存在"
    echo "请从 .env.example 复制并配置: cp .env.example .env"
    exit 1
fi

# 安装依赖
echo "📦 安装依赖..."
npm install --production

# 构建
echo "🔨 构建项目..."
npm run build

# 创建日志目录
mkdir -p logs

# 停止旧进程（如果存在）
pm2 delete claude-remote-broker 2>/dev/null || true

# 启动服务
echo "🚀 启动服务..."
pm2 start ecosystem.config.js

# 保存 PM2 配置
pm2 save

# 设置开机自启（首次运行时）
if ! pm2 startup | grep -q "already"; then
    echo "⚙️  配置开机自启..."
    pm2 startup
    echo "请执行上面显示的命令来完成开机自启配置"
fi

echo ""
echo "✅ 启动完成！"
echo ""
echo "📊 查看状态: pm2 status"
echo "📋 查看日志: pm2 logs claude-remote-broker"
echo "🔄 重启服务: pm2 restart claude-remote-broker"
echo "🛑 停止服务: pm2 stop claude-remote-broker"
```

```bash
# 设置执行权限
chmod +x start.sh

# 执行启动
./start.sh
```

### 2.6 验证 Broker 启动

```bash
# 查看 PM2 状态
pm2 status

# 查看日志
pm2 logs claude-remote-broker --lines 50

# 测试 HTTP 连接
curl http://localhost:3000

# 测试 Redis 连接
pm2 logs claude-remote-broker | grep -i redis
# 应该看到: "Redis connected" 和 "Redis ready"
```

---

## 3. 安全配置

### 3.1 配置防火墙

```bash
# Ubuntu/Debian (使用 ufw)
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 3000/tcp    # Broker
sudo ufw enable

# CentOS/RHEL (使用 firewalld)
sudo firewall-cmd --permanent --add-port=22/tcp
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

### 3.2 配置云服务商安全组

**阿里云 ECS:**
1. 登录阿里云控制台
2. 进入 ECS 实例 → 安全组
3. 添加入方向规则：
   - 端口：3000
   - 协议：TCP
   - 授权对象：0.0.0.0/0（或指定 IP）

**AWS EC2:**
1. 登录 AWS 控制台
2. 进入 EC2 → Security Groups
3. 添加 Inbound Rule：
   - Type: Custom TCP
   - Port: 3000
   - Source: 0.0.0.0/0（或指定 IP）

### 3.3 使用 Nginx 反向代理（可选）

```bash
# 安装 Nginx
sudo apt install nginx -y

# 创建配置文件
sudo nano /etc/nginx/sites-available/claude-remote
```

Nginx 配置：

```nginx
upstream broker {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name your-domain.com;

    # WebSocket 支持
    location / {
        proxy_pass http://broker;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

```bash
# 启用配置
sudo ln -s /etc/nginx/sites-available/claude-remote /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

### 3.4 配置 HTTPS（可选但推荐）

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx -y

# 获取 SSL 证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

---

## 4. 验证部署

### 4.1 检查服务状态

```bash
# 1. 检查 Redis
redis-cli -a your-redis-password ping
# 应该返回: PONG

# 2. 检查 Broker
pm2 status
# 应该显示 claude-remote-broker 状态为 online

# 3. 检查日志
pm2 logs claude-remote-broker --lines 20
# 应该看到:
# - "Redis connected"
# - "Redis ready"
# - "Nest application successfully started"
```

### 4.2 测试 HTTP 连接

```bash
# 本地测试
curl http://localhost:3000

# 远程测试
curl http://your-ecs-ip:3000
```

### 4.3 测试 WebSocket 连接

创建测试脚本 `test-connection.js`:

```javascript
const io = require('socket.io-client');

const socket = io('http://your-ecs-ip:3000', {
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('✅ Connected to broker');
  
  // 测试认证
  socket.emit('app_auth', { token: 'demo-token' });
});

socket.on('app_authenticated', (data) => {
  console.log('✅ Authenticated:', data);
  process.exit(0);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('❌ Timeout');
  process.exit(1);
}, 5000);
```

```bash
# 运行测试
node test-connection.js
```

### 4.4 测试配对功能

```bash
# 1. 启动一个 runner（在另一台机器或本地）
cd runner
npm start -- --url http://your-ecs-ip:3000 --id test-runner --secret test-secret

# 2. 查看 broker 日志，应该看到 runner 注册成功
pm2 logs claude-remote-broker

# 3. 使用 app 进行配对测试
# 在 app 中输入 runner 显示的配对码
```

---

## 5. 故障排查

### 5.1 Redis 连接失败

**症状**: 日志显示 "Redis connection error"

**排查步骤**:

```bash
# 1. 检查 Redis 是否运行
sudo systemctl status redis-server
# 或
docker ps | grep redis

# 2. 检查 Redis 端口
sudo netstat -tlnp | grep 6379

# 3. 测试 Redis 连接
redis-cli -h localhost -p 6379 -a your-password ping

# 4. 检查 .env 配置
cat /opt/claude-remote/broker/.env | grep REDIS

# 5. 检查防火墙
sudo ufw status
```

**解决方案**:
- 确保 Redis 正在运行
- 检查 REDIS_HOST、REDIS_PORT、REDIS_PASSWORD 配置
- 如果 Redis 在其他机器，确保网络可达

### 5.2 Broker 无法启动

**症状**: PM2 显示状态为 "errored"

**排查步骤**:

```bash
# 1. 查看详细日志
pm2 logs claude-remote-broker --lines 100

# 2. 检查端口占用
sudo lsof -i :3000

# 3. 手动启动查看错误
cd /opt/claude-remote/broker
node dist/main.js

# 4. 检查环境变量
pm2 show claude-remote-broker
```

**常见错误**:
- 端口被占用 → 修改 PORT 或停止占用进程
- .env 文件缺失 → 从 .env.example 复制
- Redis 连接失败 → 参考 5.1
- 依赖未安装 → 运行 `npm install`

### 5.3 WebSocket 连接失败

**症状**: App 或 Runner 无法连接

**排查步骤**:

```bash
# 1. 检查防火墙
sudo ufw status
sudo firewall-cmd --list-all

# 2. 检查云服务商安全组
# 确保 3000 端口已开放

# 3. 测试 TCP 连接
telnet your-ecs-ip 3000

# 4. 检查 Nginx 配置（如果使用）
sudo nginx -t
sudo systemctl status nginx
```

### 5.4 配对失败

**症状**: App 输入配对码后提示错误

**排查步骤**:

```bash
# 1. 检查 Redis 中的配对码
redis-cli -a your-password
> KEYS pairing:code:*
> GET pairing:code:ABC-DEF-GHI

# 2. 检查 runner 是否在线
> KEYS runner:heartbeat:*
> GET runner:heartbeat:runner-1

# 3. 查看 broker 日志
pm2 logs claude-remote-broker | grep -i pairing

# 4. 检查速率限制
> GET pairing:rate:app:user-id
```

### 5.5 性能问题

**症状**: 响应慢或连接超时

**排查步骤**:

```bash
# 1. 检查系统资源
top
free -h
df -h

# 2. 检查 Redis 性能
redis-cli -a your-password
> INFO stats
> SLOWLOG GET 10

# 3. 检查 PM2 监控
pm2 monit

# 4. 检查网络延迟
ping your-ecs-ip
```

**优化建议**:
- 增加 Redis 内存限制
- 启用 PM2 集群模式
- 使用 CDN 加速
- 优化数据库查询

---

## 6. 运维命令速查

### PM2 命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs claude-remote-broker
pm2 logs claude-remote-broker --lines 100
pm2 logs claude-remote-broker --err  # 只看错误日志

# 重启服务
pm2 restart claude-remote-broker

# 停止服务
pm2 stop claude-remote-broker

# 删除服务
pm2 delete claude-remote-broker

# 监控
pm2 monit

# 查看详细信息
pm2 show claude-remote-broker

# 清空日志
pm2 flush

# 保存配置
pm2 save

# 开机自启
pm2 startup
pm2 save
```

### Redis 命令

```bash
# 连接 Redis
redis-cli -a your-password

# 查看所有 key
KEYS *

# 查看配对相关 key
KEYS pairing:*

# 查看 runner 心跳
KEYS runner:heartbeat:*

# 查看内存使用
INFO memory

# 查看统计信息
INFO stats

# 清空数据库（慎用！）
FLUSHDB

# 查看慢查询
SLOWLOG GET 10
```

### 系统命令

```bash
# 查看系统资源
top
htop
free -h
df -h

# 查看网络连接
netstat -tlnp
ss -tlnp

# 查看进程
ps aux | grep node
ps aux | grep redis

# 查看日志
tail -f /var/log/redis/redis-server.log
journalctl -u redis-server -f
```

---

## 7. 更新部署

### 7.1 更新 Broker

```bash
# 方法 A: 使用部署脚本
./deploy-to-ecs.sh

# 方法 B: 手动更新
ssh user@your-ecs-ip
cd /opt/claude-remote/broker
git pull
npm install
npm run build
pm2 restart claude-remote-broker
```

### 7.2 回滚版本

```bash
# 1. 查看 Git 历史
git log --oneline

# 2. 回滚到指定版本
git checkout <commit-hash>

# 3. 重新构建和重启
npm install
npm run build
pm2 restart claude-remote-broker
```

### 7.3 备份和恢复

```bash
# 备份 Redis 数据
redis-cli -a your-password SAVE
cp /var/lib/redis/dump.rdb /backup/dump.rdb.$(date +%Y%m%d)

# 备份配置文件
cp /opt/claude-remote/broker/.env /backup/.env.$(date +%Y%m%d)

# 恢复 Redis 数据
sudo systemctl stop redis-server
cp /backup/dump.rdb /var/lib/redis/dump.rdb
sudo systemctl start redis-server
```

---

## 8. 监控和告警

### 8.1 设置 PM2 监控

```bash
# 安装 PM2 Plus（可选）
pm2 link <secret> <public>

# 安装日志轮转
pm2 install pm2-logrotate

# 配置日志轮转
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

### 8.2 健康检查脚本

创建 `health-check.sh`:

```bash
#!/bin/bash

# 检查 Broker
if ! curl -f http://localhost:3000 > /dev/null 2>&1; then
    echo "❌ Broker is down"
    pm2 restart claude-remote-broker
    # 发送告警邮件或通知
fi

# 检查 Redis
if ! redis-cli -a your-password ping > /dev/null 2>&1; then
    echo "❌ Redis is down"
    sudo systemctl restart redis-server
    # 发送告警邮件或通知
fi
```

```bash
# 添加到 crontab
crontab -e
# 每 5 分钟检查一次
*/5 * * * * /opt/claude-remote/broker/health-check.sh
```

---

## 需要帮助？

如果遇到问题：
1. 查看日志：`pm2 logs claude-remote-broker`
2. 检查 Redis：`redis-cli -a your-password ping`
3. 查看本文档的故障排查部分
4. 联系技术支持

祝部署顺利！🚀

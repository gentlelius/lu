# 部署和 Redis 配置总结

## 📋 文档索引

我已经为你创建了完整的部署文档和自动化脚本：

### 📚 文档
1. **[QUICK_START_DEPLOYMENT.md](./QUICK_START_DEPLOYMENT.md)** - 5 分钟快速部署指南
2. **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - 完整部署指南（包含 Redis 详细配置）
3. **[SECURITY_FIX_COMPLETED.md](./SECURITY_FIX_COMPLETED.md)** - 安全修复说明

### 🛠️ 自动化脚本
1. **`broker/quick-deploy.sh`** - 一键部署脚本（自动安装 Redis + 部署 Broker）
2. **`broker/setup-redis.sh`** - Redis 安装和配置脚本
3. **`broker/deploy-to-ecs.sh`** - 远程部署脚本（从本地部署到 ECS）

---

## 🚀 三种部署方式

### 方式 1：一键部署（最简单）⭐

```bash
# 在服务器上执行
cd /opt/claude-remote/broker
./quick-deploy.sh
```

**自动完成**：
- ✅ 安装 Redis
- ✅ 配置 Redis（密码、持久化、安全）
- ✅ 安装 PM2
- ✅ 生成安全密钥
- ✅ 构建项目
- ✅ 启动服务

**适用场景**：新服务器，首次部署

---

### 方式 2：分步部署（推荐用于生产）⭐⭐

#### 步骤 1：配置 Redis
```bash
cd /opt/claude-remote/broker
./setup-redis.sh
```

输出示例：
```
🎉 Redis 配置完成！
Redis 密码: abc123xyz...
```

#### 步骤 2：配置环境变量
```bash
cp .env.example .env
nano .env
```

修改配置：
```env
REDIS_PASSWORD=abc123xyz...  # 使用 setup-redis.sh 输出的密码
JWT_SECRET=your-random-secret
RUNNER_runner-1=your-runner-secret
```

#### 步骤 3：启动服务
```bash
npm install
npm run build
pm2 start ecosystem.config.js
pm2 save
```

**适用场景**：需要自定义配置，生产环境

---

### 方式 3：使用 Docker（最灵活）⭐⭐⭐

```bash
# 1. 启动 Redis
docker run -d \
  --name redis \
  --restart always \
  -p 6379:6379 \
  -v /data/redis:/data \
  redis:7-alpine \
  redis-server --appendonly yes --requirepass "your-password"

# 2. 配置 .env
cp .env.example .env
nano .env
# 设置 REDIS_PASSWORD=your-password

# 3. 启动 Broker
npm install
npm run build
pm2 start ecosystem.config.js
```

**适用场景**：容器化部署，开发环境

---

## 🔧 Redis 配置详解

### 环境变量配置

在 `.env` 文件中配置：

```env
# Redis 服务器地址
REDIS_HOST=localhost
# 如果 Redis 在其他机器: REDIS_HOST=10.0.0.5

# Redis 端口
REDIS_PORT=6379

# Redis 密码（强烈推荐设置）
REDIS_PASSWORD=your-strong-password

# Redis 数据库编号（0-15）
REDIS_DB=0
```

### Redis 安全配置

`setup-redis.sh` 脚本会自动配置：

1. **绑定地址**：只允许本地连接（`bind 127.0.0.1`）
2. **密码认证**：自动生成强密码
3. **持久化**：启用 AOF（`appendonly yes`）
4. **内存限制**：256MB（`maxmemory 256mb`）
5. **淘汰策略**：LRU（`maxmemory-policy allkeys-lru`）
6. **禁用危险命令**：FLUSHDB、FLUSHALL、CONFIG

### 手动配置 Redis

如果需要手动配置，编辑 Redis 配置文件：

```bash
# Ubuntu/Debian
sudo nano /etc/redis/redis.conf

# CentOS/RHEL
sudo nano /etc/redis.conf
```

关键配置项：

```conf
# 1. 绑定地址
bind 127.0.0.1

# 2. 设置密码
requirepass your-strong-password

# 3. 持久化
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec

# 4. 内存配置
maxmemory 256mb
maxmemory-policy allkeys-lru

# 5. 禁用危险命令
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command CONFIG ""
```

重启 Redis：
```bash
sudo systemctl restart redis-server
```

---

## ✅ 验证部署

### 1. 检查 Redis

```bash
# 测试连接
redis-cli -a your-password ping
# 应该返回: PONG

# 查看信息
redis-cli -a your-password INFO server
```

### 2. 检查 Broker

```bash
# 查看 PM2 状态
pm2 status

# 查看日志（应该看到 Redis connected）
pm2 logs claude-remote-broker --lines 20
```

### 3. 测试 HTTP

```bash
curl http://localhost:3000
```

### 4. 测试配对

启动 runner 并查看配对码：
```bash
cd runner
npm start -- --url http://your-server-ip:3000 --id test-runner --secret test-secret
```

---

## 🔒 安全检查清单

部署后请确认：

- [ ] Redis 设置了强密码
- [ ] Redis 只绑定到 127.0.0.1（或内网 IP）
- [ ] JWT_SECRET 使用随机生成的长字符串
- [ ] RUNNER_SECRET 使用强密码
- [ ] 防火墙只开放必要端口（22, 3000）
- [ ] 云服务商安全组配置正确
- [ ] PM2 开机自启已配置
- [ ] 日志轮转已配置

---

## 📊 监控和维护

### 日常检查

```bash
# 查看服务状态
pm2 status

# 查看最近日志
pm2 logs claude-remote-broker --lines 50

# 查看 Redis 状态
redis-cli -a your-password INFO stats

# 查看系统资源
top
free -h
df -h
```

### 定期维护

```bash
# 每周检查日志大小
du -sh /opt/claude-remote/broker/logs/

# 每月备份 Redis 数据
redis-cli -a your-password SAVE
cp /var/lib/redis/dump.rdb /backup/

# 每月更新依赖
cd /opt/claude-remote/broker
npm update
npm audit fix
pm2 restart claude-remote-broker
```

---

## 🆘 常见问题

### Q1: Redis 连接失败

**症状**：日志显示 "Redis connection error"

**解决**：
```bash
# 1. 检查 Redis 是否运行
sudo systemctl status redis-server

# 2. 检查密码是否正确
redis-cli -a your-password ping

# 3. 检查 .env 配置
cat .env | grep REDIS
```

### Q2: Broker 启动失败

**症状**：PM2 显示状态为 "errored"

**解决**：
```bash
# 查看详细错误
pm2 logs claude-remote-broker --lines 100

# 常见原因：
# - 端口被占用 → 修改 PORT 或停止占用进程
# - Redis 连接失败 → 参考 Q1
# - .env 文件缺失 → cp .env.example .env
```

### Q3: 配对失败

**症状**：App 输入配对码后提示错误

**解决**：
```bash
# 1. 检查 Redis 中的配对码
redis-cli -a your-password
> KEYS pairing:code:*
> GET pairing:code:ABC-DEF-GHI

# 2. 检查 runner 是否在线
> KEYS runner:heartbeat:*

# 3. 查看 broker 日志
pm2 logs claude-remote-broker | grep -i pairing
```

---

## 📞 获取帮助

如果遇到问题：

1. **查看日志**：`pm2 logs claude-remote-broker`
2. **检查 Redis**：`redis-cli -a your-password ping`
3. **查看文档**：
   - [完整部署指南](./DEPLOYMENT_GUIDE.md)
   - [快速开始](./QUICK_START_DEPLOYMENT.md)
   - [安全修复说明](./SECURITY_FIX_COMPLETED.md)
4. **联系技术支持**

---

## 🎉 总结

你现在有了：

✅ **完整的部署文档**
- 快速开始指南
- 详细部署指南
- Redis 配置说明

✅ **自动化脚本**
- 一键部署脚本
- Redis 配置脚本
- 远程部署脚本

✅ **安全配置**
- Redis 密码认证
- 防火墙配置
- 危险命令禁用

✅ **监控和维护**
- PM2 进程管理
- 日志轮转
- 健康检查

选择适合你的部署方式，开始使用吧！🚀

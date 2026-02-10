# 部署文档

## 架构说明

- **Broker**: 部署在 ECS 上的中心服务器，使用 PM2 管理
- **Runner**: 封装为 npm CLI 工具，可在任意机器上安装运行

---

## 一、Broker 部署到 ECS

### 1. 准备 ECS 环境

#### 1.1 安装 Node.js

```bash
# 使用 nvm 安装 Node.js (推荐)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

#### 1.2 安装 PM2

```bash
npm install -g pm2
```

#### 1.3 安装 pnpm (如果使用 monorepo)

```bash
npm install -g pnpm
```

### 2. 部署 Broker

#### 2.1 上传代码到 ECS

方式 A: 使用一键部署脚本（推荐）

```bash
# 在本地，先编辑配置
nano deploy-to-ecs.sh
# 修改 ECS_HOST、ECS_USER 等配置

# 执行部署
./deploy-to-ecs.sh
```

方式 B: 使用 Git

```bash
# 在 ECS 上
cd /opt
git clone <your-repo-url> cli-remote
cd cli-remote
```

方式 C: 使用 rsync/scp

```bash
# 在本地
rsync -avz --exclude 'node_modules' ./ user@your-ecs-ip:/opt/cli-remote/
```

#### 2.2 安装依赖并构建

```bash
cd /opt/cli-remote

# 安装依赖
pnpm install

# 构建 broker
cd broker
pnpm build
```

#### 2.3 配置环境变量

```bash
cd /opt/cli-remote/broker
cp .env.example .env
nano .env
```

编辑 `.env` 文件：

```env
PORT=3000
NODE_ENV=production
JWT_SECRET=your-random-secret-key-here-change-this

# 配置允许连接的 runner
RUNNER_runner-1=secret-runner-1
RUNNER_my-laptop=my-secure-secret

# CORS 配置（如果需要限制来源）
CORS_ORIGINS=*
```

#### 2.4 创建日志目录

```bash
mkdir -p /opt/cli-remote/broker/logs
```

#### 2.5 启动服务

```bash
cd /opt/cli-remote/broker
pnpm pm2:start
```

#### 2.6 查看服务状态

```bash
pm2 status
pm2 logs cli-remote-broker
```

#### 2.7 设置开机自启

```bash
pm2 startup
pm2 save
```

### 3. 配置防火墙

```bash
# 开放 3000 端口（或你配置的端口）
# 阿里云 ECS: 在控制台安全组中添加规则
# 或使用 iptables
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
```

### 4. 测试连接

```bash
# 在 ECS 上测试
curl http://localhost:3000

# 在本地测试
curl http://your-ecs-ip:3000
```

---

## 二、Runner CLI 使用

### 1. 发布 Runner 包

#### 1.1 本地测试

```bash
cd runner
pnpm build
npm link
```

测试命令：

```bash
runner --help
runner --url http://your-ecs-ip:3000 --id test-runner --secret test-secret
```

#### 1.2 发布到 npm

```bash
cd runner

# 登录 npm (如果还没登录)
npm login

# 发布
npm publish
```

如果是私有包：

```bash
npm publish --access restricted
```

### 2. 在客户端机器上使用

#### 2.1 全局安装

```bash
npm install -g cli-remote-runner
```

#### 2.2 配置

创建 `~/.runner.env`:

```env
BROKER_URL=http://your-ecs-ip:3000
RUNNER_ID=my-laptop
RUNNER_SECRET=my-secure-secret
```

#### 2.3 运行

```bash
runner
```

或使用命令行参数：

```bash
runner --url http://your-ecs-ip:3000 --id my-laptop --secret my-secure-secret
```

---

## 三、运维管理

### PM2 常用命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs cli-remote-broker

# 重启服务
pm2 restart cli-remote-broker

# 停止服务
pm2 stop cli-remote-broker

# 监控
pm2 monit

# 查看详细信息
pm2 show cli-remote-broker
```

### 更新部署

```bash
cd /opt/cli-remote

# 拉取最新代码
git pull

# 重新构建
cd broker
pnpm install
pnpm build

# 重启服务
pnpm pm2:restart
```

### 日志管理

日志位置: `/opt/cli-remote/broker/logs/`

```bash
# 查看错误日志
tail -f /opt/cli-remote/broker/logs/err.log

# 查看输出日志
tail -f /opt/cli-remote/broker/logs/out.log

# 清理旧日志
pm2 flush
```

---

## 四、安全建议

### 1. 使用强密码

- JWT_SECRET 使用随机生成的长字符串
- RUNNER_SECRET 使用强密码

生成随机密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. 限制 CORS

在生产环境中，不要使用 `CORS_ORIGINS=*`，而是指定具体的域名：

```env
CORS_ORIGINS=https://your-app.com,https://another-app.com
```

### 3. 使用 HTTPS (可选)

如果需要 HTTPS，可以：

- 方案 A: 使用 Nginx 反向代理
- 方案 B: 使用 Cloudflare 等 CDN
- 方案 C: 在 NestJS 中配置 SSL

### 4. 定期更新

```bash
# 更新依赖
pnpm update

# 检查安全漏洞
pnpm audit
```

---

## 五、故障排查

### Broker 无法启动

1. 检查端口是否被占用：
```bash
lsof -i :3000
```

2. 检查日志：
```bash
pm2 logs cli-remote-broker --lines 100
```

3. 检查环境变量：
```bash
pm2 show cli-remote-broker
```

### Runner 无法连接

1. 检查网络连接：
```bash
telnet your-ecs-ip 3000
```

2. 检查防火墙规则

3. 检查 Runner ID 和 Secret 是否匹配

### WebSocket 连接问题

确保防火墙允许 WebSocket 连接，Socket.IO 会自动处理协议升级。

---

## 六、性能优化

### 1. PM2 集群模式

如果需要更高性能，可以启用多实例：

编辑 `ecosystem.config.js`:

```javascript
instances: 'max', // 使用所有 CPU 核心
```

### 2. 监控

```bash
# 安装 PM2 监控
pm2 install pm2-logrotate

# 配置日志轮转
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## 联系支持

如有问题，请查看日志或联系技术支持。

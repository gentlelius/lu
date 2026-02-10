# 部署检查清单

## ✅ Runner CLI 封装

- [x] 修改 package.json（移除 private，添加 bin）
- [x] 创建 CLI 入口文件 `src/cli.ts`
- [x] 添加命令行参数解析
- [x] 支持环境变量配置
- [x] 创建 README.md 使用文档
- [x] 添加 .npmignore
- [x] 添加 .env.example
- [x] 构建测试通过

### 待完成

- [ ] 本地测试 `npm link`
- [ ] 发布到 npm `npm publish`

---

## ✅ Broker 生产环境配置

- [x] 创建 PM2 配置文件 `ecosystem.config.js`
- [x] 创建环境变量示例 `.env.example`
- [x] 添加 .gitignore
- [x] 优化 main.ts（CORS、环境变量）
- [x] 添加 PM2 管理脚本到 package.json
- [x] 创建一键部署脚本 `deploy.sh`

### 待完成

- [ ] 在 ECS 上安装 Node.js 和 PM2
- [ ] 上传代码到 ECS
- [ ] 配置 .env 文件
- [ ] 运行部署脚本
- [ ] 配置防火墙（开放 3000 端口）
- [ ] 设置 PM2 开机自启

---

## 📋 部署步骤（ECS）

### 1. 准备 ECS 环境

```bash
# 安装 Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# 安装 PM2
npm install -g pm2

# 安装 pnpm（可选）
npm install -g pnpm
```

### 2. 上传代码

```bash
# 方式 A: Git
git clone <your-repo> /opt/cli-remote

# 方式 B: rsync
rsync -avz --exclude 'node_modules' ./ user@ecs-ip:/opt/cli-remote/
```

### 3. 部署 Broker

```bash
cd /opt/cli-remote/broker

# 配置环境变量
cp .env.example .env
nano .env  # 编辑配置

# 一键部署
chmod +x deploy.sh
./deploy.sh
```

### 4. 配置防火墙

```bash
# 阿里云：在控制台安全组中添加规则
# 入方向：TCP 3000 端口，源地址 0.0.0.0/0
```

### 5. 测试连接

```bash
# 在 ECS 上
curl http://localhost:3000

# 在本地
curl http://your-ecs-ip:3000
```

---

## 📦 发布 Runner CLI

### 1. 本地测试

```bash
cd runner
npm run build
npm link
runner --help
```

### 2. 发布到 npm

```bash
npm login
npm publish
```

### 3. 客户端使用

```bash
npm install -g cli-remote-runner

# 配置
echo "BROKER_URL=http://your-ecs-ip:3000
RUNNER_ID=my-laptop
RUNNER_SECRET=your-secret" > ~/.runner.env

# 运行
runner
```

---

## 🔒 安全配置

- [ ] 修改 JWT_SECRET 为随机字符串
- [ ] 为每个 Runner 配置强密码
- [ ] 限制 CORS_ORIGINS（不使用 *）
- [ ] 配置 HTTPS（可选）

生成随机密钥：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📊 验证部署

### Broker 健康检查

```bash
pm2 status
pm2 logs cli-remote-broker
curl http://your-ecs-ip:3000
```

### Runner 连接测试

```bash
runner --url http://your-ecs-ip:3000 --id test --secret secret-runner-1
```

---

## 🎉 完成！

所有步骤完成后，你的系统应该：
- ✅ Broker 在 ECS 上运行
- ✅ PM2 管理进程
- ✅ Runner CLI 可通过 npm 安装
- ✅ 客户端可以连接到 Broker

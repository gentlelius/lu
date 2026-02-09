# 脚本使用指南

## 📁 脚本文件说明

### 1. `deploy-to-ecs.sh` - 本地部署脚本
**位置**: 项目根目录  
**执行位置**: 在你的本地电脑上执行  
**作用**: 从本地一键部署到 ECS

#### 使用步骤：

1. 编辑配置：
```bash
nano deploy-to-ecs.sh
```

修改这些配置：
```bash
ECS_HOST="your-ecs-ip"           # 改为你的 ECS IP
ECS_USER="root"                   # 改为你的 SSH 用户名
ECS_PATH="/opt/cli-remote"     # 部署目录（可选）
ECS_PORT="22"                     # SSH 端口（可选）
```

2. 执行部署：
```bash
./deploy-to-ecs.sh
```

这个脚本会：
- ✅ 将代码同步到 ECS
- ✅ 自动在 ECS 上执行 `broker/start.sh`
- ✅ 完成整个部署流程

---

### 2. `broker/start.sh` - ECS 部署脚本
**位置**: `broker/` 目录  
**执行位置**: 在 ECS 服务器上执行  
**作用**: 在 ECS 上构建和启动 Broker 服务

#### 使用场景：

**场景 A**: 通过 `deploy-to-ecs.sh` 自动调用（推荐）
```bash
# 在本地执行
./deploy-to-ecs.sh
```

**场景 B**: 直接在 ECS 上手动执行
```bash
# SSH 登录到 ECS
ssh user@your-ecs-ip

# 进入目录
cd /opt/cli-remote/broker

# 首次部署需要配置环境变量
cp .env.example .env
nano .env  # 编辑配置

# 执行部署
./start.sh
```

这个脚本会：
- ✅ 检查 .env 文件
- ✅ 安装依赖
- ✅ 构建项目
- ✅ 启动/重启 PM2 服务

---

## 🎯 推荐工作流程

### 首次部署

```bash
# 1. 在本地配置部署脚本
nano deploy-to-ecs.sh
# 修改 ECS_HOST 等配置

# 2. 执行部署
./deploy-to-ecs.sh

# 3. 首次部署会提示配置 .env
# SSH 登录到 ECS 配置环境变量
ssh user@your-ecs-ip
cd /opt/cli-remote/broker
nano .env  # 编辑配置

# 4. 再次执行部署
./start.sh
```

### 后续更新

```bash
# 在本地直接执行即可
./deploy-to-ecs.sh
```

---

## 📊 部署后检查

### 在本地检查

```bash
# 查看服务状态
ssh user@your-ecs-ip 'pm2 status'

# 查看日志
ssh user@your-ecs-ip 'pm2 logs cli-remote-broker --lines 50'

# 测试连接
curl http://your-ecs-ip:3000
```

### 在 ECS 上检查

```bash
# SSH 登录
ssh user@your-ecs-ip

# 查看 PM2 状态
pm2 status

# 查看日志
pm2 logs cli-remote-broker

# 实时监控
pm2 monit
```

---

## 🔧 常见问题

### Q: deploy-to-ecs.sh 执行失败？
A: 检查：
- SSH 连接是否正常：`ssh user@your-ecs-ip`
- ECS_HOST、ECS_USER 配置是否正确
- 是否有 SSH 密钥或需要输入密码

### Q: broker/start.sh 提示 .env 不存在？
A: 首次部署需要配置环境变量：
```bash
cd /opt/cli-remote/broker
cp .env.example .env
nano .env  # 编辑配置
./start.sh
```

### Q: PM2 未安装？
A: 在 ECS 上安装：
```bash
npm install -g pm2
```

### Q: 如何回滚？
A: 
```bash
# 在 ECS 上
cd /opt/cli-remote
git checkout <previous-commit>
cd broker
./start.sh
```

---

## 📝 总结

| 脚本 | 位置 | 执行位置 | 用途 |
|------|------|----------|------|
| `deploy-to-ecs.sh` | 根目录 | 本地 | 一键部署到 ECS |
| `broker/start.sh` | broker/ | ECS | 在 ECS 上构建和启动 |

**最简单的方式**: 配置好 `deploy-to-ecs.sh` 后，每次更新只需在本地执行 `./deploy-to-ecs.sh` 即可！

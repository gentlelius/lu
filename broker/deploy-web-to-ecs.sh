#!/bin/bash

# 完整的 Web 部署脚本 - 构建 + 部署到远端 ECS
# 用法: ./deploy-web-to-ecs.sh

set -e

# ========== 配置区域 ==========
# 请修改以下配置为你的实际信息
ECS_HOST="115.191.40.55"           # ECS 服务器 IP 或域名
ECS_USER="root"                    # SSH 用户名
ECS_PATH="/opt/cli-remote"         # 部署目录
ECS_PORT="22"                      # SSH 端口

# ========== 脚本开始 ==========

echo "🚀 开始完整部署流程（构建 + 部署）..."
echo ""
echo "目标服务器: $ECS_USER@$ECS_HOST"
echo "部署路径: $ECS_PATH"
echo ""

# 检查配置
if [ "$ECS_HOST" = "your-ecs-ip" ]; then
  echo "❌ 错误: 请先修改脚本中的 ECS_HOST 配置"
  echo "   编辑 deploy-web-to-ecs.sh，设置你的 ECS IP 地址"
  exit 1
fi

# 确认部署
read -p "确认部署到 $ECS_HOST? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ 取消部署"
  exit 1
fi

# ========== 步骤 1: 构建 app web 版 ==========
echo ""
echo "📱 步骤 1/4: 构建 app web 版..."
cd ../app
if [ ! -d "node_modules" ]; then
    echo "   安装 app 依赖..."
    pnpm install
fi
pnpm run build:web
echo "   ✅ app web 版构建完成"

# ========== 步骤 2: 构建 broker ==========
echo ""
echo "🔧 步骤 2/4: 构建 broker..."
cd ../broker
if [ ! -d "node_modules" ]; then
    echo "   安装 broker 依赖..."
    pnpm install
fi
pnpm run build
echo "   ✅ broker 构建完成"

# ========== 步骤 3: 同步代码到 ECS ==========
echo ""
echo "📦 步骤 3/4: 同步代码到 ECS..."

# 创建远程目录
ssh -p $ECS_PORT $ECS_USER@$ECS_HOST "mkdir -p $ECS_PATH/broker"

# 同步 broker 代码（包含构建好的 dist 和 web 文件）
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude 'logs' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '*.log' \
  -e "ssh -p $ECS_PORT" \
  ./ \
  $ECS_USER@$ECS_HOST:$ECS_PATH/broker/

echo "   ✅ 代码同步完成"

# ========== 步骤 4: 在 ECS 上部署 ==========
echo ""
echo "🔨 步骤 4/4: 在 ECS 上执行部署..."
ssh -p $ECS_PORT $ECS_USER@$ECS_HOST << 'ENDSSH'
cd /opt/cli-remote/broker

# 检查 .env 文件
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    echo "⚠️  警告: .env 文件不存在，从 .env.example 复制..."
    cp .env.example .env
    echo "📝 请编辑 .env 文件配置环境变量: nano .env"
    echo "   然后重新运行: ./start.sh"
    exit 1
  else
    echo "❌ 错误: .env.example 文件不存在！"
    exit 1
  fi
fi

# 安装依赖（仅生产依赖）
echo "📦 安装生产依赖..."
pnpm install --production

# 检查 PM2 是否已安装
if ! command -v pm2 &> /dev/null; then
  echo "📦 安装 PM2..."
  pnpm install -g pm2
fi

# 启动或重启服务
if pm2 list | grep -q "cli-remote-broker"; then
  echo "🔄 重启服务..."
  pm2 restart cli-remote-broker
else
  echo "🚀 启动服务..."
  pm2 start ecosystem.config.js
fi

# 保存 PM2 配置
pm2 save

echo ""
echo "✅ 服务部署完成！"
ENDSSH

echo ""
echo "✨ 部署完成！"
echo ""
echo "📊 查看状态:"
echo "   ssh -p $ECS_PORT $ECS_USER@$ECS_HOST 'pm2 status'"
echo ""
echo "📋 查看日志:"
echo "   ssh -p $ECS_PORT $ECS_USER@$ECS_HOST 'pm2 logs cli-remote-broker'"
echo ""
echo "🌐 访问地址:"
echo "   http://$ECS_HOST:3000"
echo ""
echo "💡 提示:"
echo "   - 如果需要配置 Nginx 反向代理，请参考 docs/nginx-config-example.conf"
echo "   - 如果需要配置域名，请修改 DNS 解析指向 $ECS_HOST"

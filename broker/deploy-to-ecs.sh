#!/bin/bash

# 本地部署脚本 - 将代码部署到远端 ECS
# 用法: ./deploy-to-ecs.sh

set -e

# ========== 配置区域 ==========
# 请修改以下配置为你的实际信息
ECS_HOST="115.191.40.55"           # ECS 服务器 IP 或域名
ECS_USER="root"                   # SSH 用户名
ECS_PATH="/opt/claude-remote"     # 部署目录
ECS_PORT="22"                     # SSH 端口

# ========== 脚本开始 ==========

echo "🚀 开始部署到 ECS..."
echo ""
echo "目标服务器: $ECS_USER@$ECS_HOST"
echo "部署路径: $ECS_PATH"
echo ""

# 检查配置
if [ "$ECS_HOST" = "your-ecs-ip" ]; then
  echo "❌ 错误: 请先修改脚本中的 ECS_HOST 配置"
  echo "   编辑 deploy-to-ecs.sh，设置你的 ECS IP 地址"
  exit 1
fi

# 确认部署
read -p "确认部署到 $ECS_HOST? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ 取消部署"
  exit 1
fi

# 1. 在 ECS 上创建目录
echo ""
echo "📁 创建部署目录..."
ssh -p $ECS_PORT $ECS_USER@$ECS_HOST "mkdir -p $ECS_PATH/broker"

# 2. 同步代码到 ECS
echo ""
echo "📦 同步代码到 ECS..."
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'logs' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '*.log' \
  -e "ssh -p $ECS_PORT" \
  ./ \
  $ECS_USER@$ECS_HOST:$ECS_PATH/broker/

# 确保 .env.example 被同步
echo ""
echo "📄 确保 .env.example 文件存在..."
scp -P $ECS_PORT .env.example $ECS_USER@$ECS_HOST:$ECS_PATH/broker/.env.example

echo "✅ 代码同步完成"

# 3. 在 ECS 上执行部署
echo ""
echo "🔨 在 ECS 上执行部署..."
ssh -p $ECS_PORT $ECS_USER@$ECS_HOST << 'ENDSSH'
cd /opt/claude-remote/broker

# 检查 .env.example 文件
if [ ! -f ".env.example" ]; then
  echo "❌ 错误: .env.example 文件不存在！"
  echo "   这不应该发生，请检查同步过程"
  exit 1
fi

# 检查 .env 文件
if [ ! -f ".env" ]; then
  echo "⚠️  警告: .env 文件不存在，从 .env.example 复制..."
  cp .env.example .env
  echo "📝 请编辑 .env 文件配置环境变量: nano .env"
  echo "   然后重新运行: ./start.sh"
  exit 1
fi

# 执行部署脚本
chmod +x start.sh
./start.sh
ENDSSH

echo ""
echo "✅ 部署完成！"
echo ""
echo "📊 查看状态:"
echo "   ssh $ECS_USER@$ECS_HOST 'pm2 status'"
echo ""
echo "📋 查看日志:"
echo "   ssh $ECS_USER@$ECS_HOST 'pm2 logs claude-remote-broker'"
echo ""
echo "🌐 访问地址:"
echo "   http://$ECS_HOST:3000"

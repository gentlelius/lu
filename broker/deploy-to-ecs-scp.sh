#!/bin/bash

# 使用 SCP 的部署脚本（rsync 的替代方案）
# 用法: ./deploy-to-ecs-scp.sh

set -e

# ========== 配置区域 ==========
ECS_HOST="your-ecs-ip"
ECS_USER="root"
ECS_PATH="/opt/claude-remote"
ECS_PORT="22"

# ========== 脚本开始 ==========

echo "🚀 开始部署到 ECS (使用 SCP)..."
echo ""
echo "目标服务器: $ECS_USER@$ECS_HOST"
echo "部署路径: $ECS_PATH"
echo ""

# 检查配置
if [ "$ECS_HOST" = "your-ecs-ip" ]; then
  echo "❌ 错误: 请先修改脚本中的 ECS_HOST 配置"
  exit 1
fi

# 确认部署
read -p "确认部署到 $ECS_HOST? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ 取消部署"
  exit 1
fi

# 1. 打包代码
echo ""
echo "📦 打包代码..."
cd broker
tar --exclude='node_modules' \
    --exclude='dist' \
    --exclude='logs' \
    --exclude='.env' \
    --exclude='*.log' \
    -czf ../broker.tar.gz .
cd ..

echo "✅ 打包完成"

# 2. 在 ECS 上创建目录
echo ""
echo "📁 创建部署目录..."
ssh -P $ECS_PORT $ECS_USER@$ECS_HOST "mkdir -p $ECS_PATH/broker"

# 3. 上传到 ECS
echo ""
echo "📤 上传到 ECS..."
scp -P $ECS_PORT broker.tar.gz $ECS_USER@$ECS_HOST:/tmp/

echo "✅ 上传完成"

# 4. 在 ECS 上解压并部署
echo ""
echo "🔨 在 ECS 上执行部署..."
ssh -p $ECS_PORT $ECS_USER@$ECS_HOST << ENDSSH
# 创建目录
mkdir -p $ECS_PATH/broker

# 解压
cd $ECS_PATH/broker
tar -xzf /tmp/broker.tar.gz

# 清理临时文件
rm /tmp/broker.tar.gz

# 检查 .env 文件
if [ ! -f ".env" ]; then
  echo "⚠️  警告: .env 文件不存在，从 .env.example 复制..."
  cp .env.example .env
  echo "📝 请编辑 .env 文件配置环境变量"
  exit 1
fi

# 执行部署脚本
chmod +x start.sh
./start.sh
ENDSSH

# 5. 清理本地临时文件
rm broker.tar.gz

echo ""
echo "✅ 部署完成！"
echo ""
echo "📊 查看状态:"
echo "   ssh -p $ECS_PORT $ECS_USER@$ECS_HOST 'pm2 status'"
echo ""
echo "🌐 访问地址:"
echo "   http://$ECS_HOST:3000"

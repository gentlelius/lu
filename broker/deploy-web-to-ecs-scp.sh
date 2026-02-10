#!/bin/bash

# 完整的 Web 部署脚本（使用 SCP）- 构建 + 部署到远端 ECS
# 用法: ./deploy-web-to-ecs-scp.sh

set -e

# ========== 配置区域 ==========
ECS_HOST="115.191.40.55"
ECS_USER="root"
ECS_PATH="/opt/cli-remote"
ECS_PORT="22"

# ========== 脚本开始 ==========

echo "🚀 开始完整部署流程（构建 + 打包 + 部署）..."
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

# ========== 步骤 1: 构建 app web 版 ==========
echo ""
echo "📱 步骤 1/5: 构建 app web 版..."
cd ../app
if [ ! -d "node_modules" ]; then
    echo "   安装 app 依赖..."
    pnpm install
fi
pnpm run build:web
echo "   ✅ app web 版构建完成"

# ========== 步骤 2: 构建 broker ==========
echo ""
echo "🔧 步骤 2/5: 构建 broker..."
cd ../broker
if [ ! -d "node_modules" ]; then
    echo "   安装 broker 依赖..."
    pnpm install
fi
pnpm run build
echo "   ✅ broker 构建完成"

# ========== 步骤 3: 打包代码 ==========
echo ""
echo "📦 步骤 3/5: 打包代码..."
# 将 app/dist 复制到 broker/app/dist，确保随 broker 一起部署
rm -rf app/dist
mkdir -p app
cp -R ../app/dist app/
tar --exclude='node_modules' \
    --exclude='logs' \
    --exclude='.git' \
    --exclude='.env' \
    --exclude='.env.local' \
    --exclude='*.log' \
    -czf ../broker-deploy.tar.gz .

echo "   ✅ 打包完成"

# ========== 步骤 4: 上传到 ECS ==========
echo ""
echo "📤 步骤 4/5: 上传到 ECS..."

# 创建远程目录
ssh -p $ECS_PORT $ECS_USER@$ECS_HOST "mkdir -p $ECS_PATH/broker"

# 上传压缩包
scp -P $ECS_PORT ../broker-deploy.tar.gz $ECS_USER@$ECS_HOST:/tmp/

echo "   ✅ 上传完成"

# ========== 步骤 5: 在 ECS 上部署 ==========
echo ""
echo "🔨 步骤 5/5: 在 ECS 上执行部署..."
ssh -p $ECS_PORT $ECS_USER@$ECS_HOST << ENDSSH
# 解压到部署目录
cd $ECS_PATH/broker
tar -xzf /tmp/broker-deploy.tar.gz

# 清理临时文件
rm /tmp/broker-deploy.tar.gz

# 检查 .env 文件
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    echo "⚠️  警告: .env 文件不存在，从 .env.example 复制..."
    cp .env.example .env
    echo "📝 请编辑 .env 文件配置环境变量: nano .env"
    echo "   然后重新运行: pnpm run pm2:start"
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

# 清理本地临时文件
cd ..
rm broker-deploy.tar.gz

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

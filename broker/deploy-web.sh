#!/bin/bash

# 快速部署脚本 - 构建并部署到生产环境

set -e

echo "🚀 开始部署流程..."

# 检查是否在 broker 目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误：请在 broker 目录下运行此脚本"
    exit 1
fi

# 1. 构建 app web 版
echo ""
echo "📱 步骤 1/3: 构建 app web 版..."
cd ../app
if [ ! -d "node_modules" ]; then
    echo "   安装 app 依赖..."
    npm install
fi
npm run build:web
echo "   ✅ app web 版构建完成"

# 2. 构建 broker
echo ""
echo "🔧 步骤 2/3: 构建 broker..."
cd ../broker
if [ ! -d "node_modules" ]; then
    echo "   安装 broker 依赖..."
    npm install
fi
npm run build
echo "   ✅ broker 构建完成"

# 3. 重启服务（如果正在运行）
echo ""
echo "🔄 步骤 3/3: 重启服务..."
if pm2 list | grep -q "cli-remote-broker"; then
    echo "   检测到 PM2 服务正在运行，重启中..."
    npm run pm2:restart
    echo "   ✅ 服务已重启"
else
    echo "   未检测到运行中的服务"
    echo "   启动服务请运行："
    echo "     npm run pm2:start"
    echo "   或："
    echo "     npm run start:prod"
fi

echo ""
echo "✨ 部署完成！"
echo ""
echo "📊 查看状态："
echo "  pm2 status"
echo ""
echo "📝 查看日志："
echo "  pm2 logs cli-remote-broker"
echo ""
echo "🌐 访问应用："
echo "  http://localhost:3000"

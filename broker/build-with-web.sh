#!/bin/bash

# 构建 app web 版和 broker 的脚本

set -e

echo "🔨 开始构建..."

# 1. 构建 app web 版
echo "📱 构建 app web 版..."
cd ../app
npm run build:web

# 2. 构建 broker
echo "🚀 构建 broker..."
cd ../broker
npm run build

echo "✅ 构建完成！"
echo ""
echo "启动服务："
echo "  npm run start:prod"
echo ""
echo "或使用 PM2："
echo "  npm run pm2:start"

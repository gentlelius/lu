#!/bin/bash

# Broker 部署脚本
# 用法: ./start.sh

set -e

echo "🚀 开始部署 Broker..."

# 检查是否在 broker 目录
if [ ! -f "package.json" ]; then
  echo "❌ 错误: 请在 broker 目录下运行此脚本"
  exit 1
fi

# 检查 .env 文件
if [ ! -f ".env" ]; then
  echo "⚠️  警告: .env 文件不存在，从 .env.example 复制..."
  cp .env.example .env
  echo "📝 请编辑 .env 文件配置环境变量"
  exit 1
fi

# 安装依赖
echo "📦 安装依赖..."
pnpm install

# 构建项目
echo "🔨 构建项目..."
pnpm build

# 创建日志目录
echo "📁 创建日志目录..."
mkdir -p logs

# 检查 PM2 是否安装
if ! command -v pm2 &> /dev/null; then
  echo "❌ PM2 未安装，请先安装: npm install -g pm2"
  exit 1
fi

# 启动或重启服务
if pm2 list | grep -q "claude-remote-broker"; then
  echo "🔄 重启服务..."
  pnpm pm2:restart
else
  echo "▶️  启动服务..."
  pnpm pm2:start
fi

# 保存 PM2 配置
pm2 save

echo ""
echo "✅ 部署完成！"
echo ""
echo "📊 查看状态: pm2 status"
echo "📋 查看日志: pm2 logs claude-remote-broker"
echo "🔍 监控: pm2 monit"

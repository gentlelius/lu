#!/bin/bash

# Cli Remote Broker 一键部署脚本
# 用法: ./quick-deploy.sh

set -e

echo "🚀 Cli Remote Broker 一键部署脚本"
echo "======================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检测操作系统
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo -e "${RED}❌ 无法检测操作系统${NC}"
    exit 1
fi

echo "检测到操作系统: $OS"
echo ""

# ========== 1. 安装 Redis ==========
echo -e "${GREEN}📦 步骤 1/6: 安装 Redis${NC}"
echo ""

if command -v redis-server &> /dev/null; then
    echo "✅ Redis 已安装"
    redis-server --version
else
    echo "正在安装 Redis..."
    
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        sudo apt update
        sudo apt install redis-server -y
    elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ]; then
        sudo yum install epel-release -y
        sudo yum install redis -y
    else
        echo -e "${YELLOW}⚠️  未知操作系统，请手动安装 Redis${NC}"
        echo "参考: https://redis.io/docs/getting-started/installation/"
        exit 1
    fi
    
    echo "✅ Redis 安装完成"
fi

# 启动 Redis
echo "启动 Redis..."
if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
    sudo systemctl start redis-server
    sudo systemctl enable redis-server
elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ]; then
    sudo systemctl start redis
    sudo systemctl enable redis
fi

# 测试 Redis
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis 运行正常"
else
    echo -e "${RED}❌ Redis 启动失败${NC}"
    exit 1
fi

echo ""

# ========== 2. 安装 Node.js ==========
echo -e "${GREEN}📦 步骤 2/6: 检查 Node.js${NC}"
echo ""

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    echo "✅ Node.js 已安装: $(node -v)"
    
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo -e "${YELLOW}⚠️  Node.js 版本过低，建议升级到 18+${NC}"
        echo "使用 nvm 升级: nvm install 20 && nvm use 20"
    fi
else
    echo -e "${YELLOW}⚠️  Node.js 未安装${NC}"
    echo "请先安装 Node.js 18+:"
    echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    echo "  source ~/.bashrc"
    echo "  nvm install 20"
    exit 1
fi

echo ""

# ========== 3. 安装 PM2 ==========
echo -e "${GREEN}📦 步骤 3/6: 安装 PM2${NC}"
echo ""

if command -v pm2 &> /dev/null; then
    echo "✅ PM2 已安装: $(pm2 -v)"
else
    echo "正在安装 PM2..."
    npm install -g pm2
    echo "✅ PM2 安装完成"
fi

echo ""

# ========== 4. 配置环境变量 ==========
echo -e "${GREEN}⚙️  步骤 4/6: 配置环境变量${NC}"
echo ""

if [ ! -f ".env" ]; then
    echo "创建 .env 文件..."
    cp .env.example .env
    
    # 生成随机密钥
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    RUNNER_SECRET=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
    
    # 更新 .env 文件
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
        sed -i '' "s/RUNNER_runner-1=.*/RUNNER_runner-1=$RUNNER_SECRET/" .env
    else
        # Linux
        sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
        sed -i "s/RUNNER_runner-1=.*/RUNNER_runner-1=$RUNNER_SECRET/" .env
    fi
    
    echo "✅ .env 文件已创建并配置随机密钥"
    echo ""
    echo -e "${YELLOW}⚠️  重要: 请记录以下信息${NC}"
    echo "Runner ID: runner-1"
    echo "Runner Secret: $RUNNER_SECRET"
    echo ""
else
    echo "✅ .env 文件已存在"
fi

# 检查 Redis 配置
echo "检查 Redis 配置..."
REDIS_HOST=$(grep REDIS_HOST .env | cut -d'=' -f2)
REDIS_PORT=$(grep REDIS_PORT .env | cut -d'=' -f2)
REDIS_PASSWORD=$(grep REDIS_PASSWORD .env | cut -d'=' -f2)

echo "Redis 配置:"
echo "  Host: ${REDIS_HOST:-localhost}"
echo "  Port: ${REDIS_PORT:-6379}"
echo "  Password: ${REDIS_PASSWORD:-(无)}"

# 测试 Redis 连接
if [ -z "$REDIS_PASSWORD" ]; then
    if redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" ping > /dev/null 2>&1; then
        echo "✅ Redis 连接测试成功"
    else
        echo -e "${RED}❌ Redis 连接失败${NC}"
        echo "请检查 .env 中的 Redis 配置"
        exit 1
    fi
else
    if redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" -a "$REDIS_PASSWORD" ping > /dev/null 2>&1; then
        echo "✅ Redis 连接测试成功"
    else
        echo -e "${RED}❌ Redis 连接失败${NC}"
        echo "请检查 .env 中的 Redis 配置"
        exit 1
    fi
fi

echo ""

# ========== 5. 安装依赖和构建 ==========
echo -e "${GREEN}🔨 步骤 5/6: 安装依赖和构建${NC}"
echo ""

echo "安装依赖..."
npm install

echo "构建项目..."
npm run build

echo "✅ 构建完成"
echo ""

# ========== 6. 启动服务 ==========
echo -e "${GREEN}🚀 步骤 6/6: 启动服务${NC}"
echo ""

# 创建日志目录
mkdir -p logs

# 停止旧进程（如果存在）
pm2 delete claude-remote-broker 2>/dev/null || true

# 启动服务
echo "启动 Broker..."
pm2 start ecosystem.config.js

# 保存 PM2 配置
pm2 save

echo "✅ 服务启动成功"
echo ""

# ========== 7. 验证部署 ==========
echo -e "${GREEN}✅ 验证部署${NC}"
echo ""

# 等待服务启动
sleep 3

# 检查 PM2 状态
echo "PM2 状态:"
pm2 status

echo ""

# 检查日志
echo "最近日志:"
pm2 logs claude-remote-broker --lines 10 --nostream

echo ""

# 测试 HTTP 连接
echo "测试 HTTP 连接..."
if curl -f http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ HTTP 连接正常"
else
    echo -e "${YELLOW}⚠️  HTTP 连接失败，请检查日志${NC}"
fi

echo ""

# ========== 8. 显示部署信息 ==========
echo -e "${GREEN}======================================"
echo "🎉 部署完成！"
echo "======================================${NC}"
echo ""
echo "📊 服务信息:"
echo "  状态: $(pm2 jlist | jq -r '.[0].pm2_env.status')"
echo "  端口: $(grep PORT .env | cut -d'=' -f2)"
echo "  进程: claude-remote-broker"
echo ""
echo "🔧 常用命令:"
echo "  查看状态: pm2 status"
echo "  查看日志: pm2 logs claude-remote-broker"
echo "  重启服务: pm2 restart claude-remote-broker"
echo "  停止服务: pm2 stop claude-remote-broker"
echo ""
echo "🌐 访问地址:"
echo "  本地: http://localhost:3000"
echo "  外网: http://$(curl -s ifconfig.me):3000"
echo ""
echo "📝 Runner 配置:"
echo "  Runner ID: runner-1"
echo "  Runner Secret: 请查看 .env 文件中的 RUNNER_runner-1"
echo ""
echo "⚙️  开机自启:"
echo "  首次部署请运行: pm2 startup"
echo "  然后执行显示的命令"
echo ""
echo "📚 更多信息请查看: docs/DEPLOYMENT_GUIDE.md"
echo ""

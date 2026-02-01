#!/bin/bash

# Redis 安装和配置脚本
# 用法: ./setup-redis.sh

set -e

echo "🔧 Redis 安装和配置脚本"
echo "========================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

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
echo -e "${GREEN}📦 步骤 1/4: 安装 Redis${NC}"
echo ""

if command -v redis-server &> /dev/null; then
    echo "✅ Redis 已安装"
    redis-server --version
    
    read -p "是否重新配置 Redis? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "跳过 Redis 安装"
        SKIP_INSTALL=true
    fi
fi

if [ "$SKIP_INSTALL" != "true" ]; then
    echo "正在安装 Redis..."
    
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        sudo apt update
        sudo apt install redis-server -y
        REDIS_CONF="/etc/redis/redis.conf"
        REDIS_SERVICE="redis-server"
    elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ]; then
        sudo yum install epel-release -y
        sudo yum install redis -y
        REDIS_CONF="/etc/redis.conf"
        REDIS_SERVICE="redis"
    else
        echo -e "${YELLOW}⚠️  未知操作系统${NC}"
        echo "请选择安装方式:"
        echo "1) 使用 Docker"
        echo "2) 手动安装"
        read -p "选择 (1/2): " choice
        
        if [ "$choice" = "1" ]; then
            echo "使用 Docker 安装 Redis..."
            
            # 检查 Docker
            if ! command -v docker &> /dev/null; then
                echo "安装 Docker..."
                curl -fsSL https://get.docker.com -o get-docker.sh
                sudo sh get-docker.sh
                rm get-docker.sh
            fi
            
            # 生成 Redis 密码
            REDIS_PASSWORD=$(openssl rand -base64 32)
            
            # 运行 Redis 容器
            docker run -d \
              --name redis \
              --restart always \
              -p 6379:6379 \
              -v /data/redis:/data \
              redis:7-alpine \
              redis-server --appendonly yes --requirepass "$REDIS_PASSWORD"
            
            echo "✅ Redis Docker 容器已启动"
            echo ""
            echo -e "${YELLOW}⚠️  重要: 请记录 Redis 密码${NC}"
            echo "Redis 密码: $REDIS_PASSWORD"
            echo ""
            echo "请将以下配置添加到 .env 文件:"
            echo "REDIS_HOST=localhost"
            echo "REDIS_PORT=6379"
            echo "REDIS_PASSWORD=$REDIS_PASSWORD"
            echo ""
            
            exit 0
        else
            echo "请手动安装 Redis: https://redis.io/docs/getting-started/installation/"
            exit 1
        fi
    fi
    
    echo "✅ Redis 安装完成"
fi

echo ""

# ========== 2. 配置 Redis ==========
echo -e "${GREEN}⚙️  步骤 2/4: 配置 Redis${NC}"
echo ""

# 备份原配置
if [ -f "$REDIS_CONF" ]; then
    echo "备份原配置文件..."
    sudo cp "$REDIS_CONF" "$REDIS_CONF.backup.$(date +%Y%m%d%H%M%S)"
    echo "✅ 备份完成: $REDIS_CONF.backup.*"
fi

# 生成 Redis 密码
echo "生成 Redis 密码..."
REDIS_PASSWORD=$(openssl rand -base64 32)
echo "Redis 密码: $REDIS_PASSWORD"
echo ""

# 配置 Redis
echo "配置 Redis..."

# 1. 绑定地址（只允许本地连接）
sudo sed -i 's/^bind .*/bind 127.0.0.1/' "$REDIS_CONF" || \
    echo "bind 127.0.0.1" | sudo tee -a "$REDIS_CONF" > /dev/null

# 2. 设置密码
if grep -q "^requirepass" "$REDIS_CONF"; then
    sudo sed -i "s/^requirepass .*/requirepass $REDIS_PASSWORD/" "$REDIS_CONF"
else
    echo "requirepass $REDIS_PASSWORD" | sudo tee -a "$REDIS_CONF" > /dev/null
fi

# 3. 启用 AOF 持久化
if grep -q "^appendonly" "$REDIS_CONF"; then
    sudo sed -i 's/^appendonly .*/appendonly yes/' "$REDIS_CONF"
else
    echo "appendonly yes" | sudo tee -a "$REDIS_CONF" > /dev/null
fi

# 4. 设置内存限制
if grep -q "^maxmemory" "$REDIS_CONF"; then
    sudo sed -i 's/^maxmemory .*/maxmemory 256mb/' "$REDIS_CONF"
else
    echo "maxmemory 256mb" | sudo tee -a "$REDIS_CONF" > /dev/null
fi

# 5. 设置内存淘汰策略
if grep -q "^maxmemory-policy" "$REDIS_CONF"; then
    sudo sed -i 's/^maxmemory-policy .*/maxmemory-policy allkeys-lru/' "$REDIS_CONF"
else
    echo "maxmemory-policy allkeys-lru" | sudo tee -a "$REDIS_CONF" > /dev/null
fi

# 6. 禁用危险命令
echo "" | sudo tee -a "$REDIS_CONF" > /dev/null
echo "# Security: Disable dangerous commands" | sudo tee -a "$REDIS_CONF" > /dev/null
echo 'rename-command FLUSHDB ""' | sudo tee -a "$REDIS_CONF" > /dev/null
echo 'rename-command FLUSHALL ""' | sudo tee -a "$REDIS_CONF" > /dev/null
echo 'rename-command CONFIG ""' | sudo tee -a "$REDIS_CONF" > /dev/null

echo "✅ Redis 配置完成"
echo ""

# ========== 3. 启动 Redis ==========
echo -e "${GREEN}🚀 步骤 3/4: 启动 Redis${NC}"
echo ""

echo "重启 Redis 服务..."
sudo systemctl restart "$REDIS_SERVICE"
sudo systemctl enable "$REDIS_SERVICE"

# 等待 Redis 启动
sleep 2

# 检查 Redis 状态
if sudo systemctl is-active --quiet "$REDIS_SERVICE"; then
    echo "✅ Redis 服务运行正常"
else
    echo -e "${RED}❌ Redis 服务启动失败${NC}"
    echo "查看日志: sudo journalctl -u $REDIS_SERVICE -n 50"
    exit 1
fi

echo ""

# ========== 4. 测试 Redis ==========
echo -e "${GREEN}✅ 步骤 4/4: 测试 Redis${NC}"
echo ""

echo "测试 Redis 连接..."
if redis-cli -a "$REDIS_PASSWORD" ping > /dev/null 2>&1; then
    echo "✅ Redis 连接测试成功"
else
    echo -e "${RED}❌ Redis 连接测试失败${NC}"
    exit 1
fi

echo ""
echo "测试基本操作..."
redis-cli -a "$REDIS_PASSWORD" SET test "hello" > /dev/null
RESULT=$(redis-cli -a "$REDIS_PASSWORD" GET test)
redis-cli -a "$REDIS_PASSWORD" DEL test > /dev/null

if [ "$RESULT" = "hello" ]; then
    echo "✅ Redis 读写测试成功"
else
    echo -e "${RED}❌ Redis 读写测试失败${NC}"
    exit 1
fi

echo ""

# ========== 5. 显示配置信息 ==========
echo -e "${GREEN}======================================"
echo "🎉 Redis 配置完成！"
echo "======================================${NC}"
echo ""
echo "📊 Redis 信息:"
echo "  版本: $(redis-server --version | cut -d' ' -f3)"
echo "  配置文件: $REDIS_CONF"
echo "  服务名称: $REDIS_SERVICE"
echo "  绑定地址: 127.0.0.1"
echo "  端口: 6379"
echo ""
echo -e "${YELLOW}⚠️  重要: 请记录以下信息${NC}"
echo "Redis 密码: $REDIS_PASSWORD"
echo ""
echo "📝 Broker .env 配置:"
echo "  REDIS_HOST=localhost"
echo "  REDIS_PORT=6379"
echo "  REDIS_PASSWORD=$REDIS_PASSWORD"
echo "  REDIS_DB=0"
echo ""
echo "🔧 常用命令:"
echo "  连接 Redis: redis-cli -a '$REDIS_PASSWORD'"
echo "  查看状态: sudo systemctl status $REDIS_SERVICE"
echo "  重启服务: sudo systemctl restart $REDIS_SERVICE"
echo "  查看日志: sudo journalctl -u $REDIS_SERVICE -f"
echo ""
echo "📚 更多信息请查看: docs/DEPLOYMENT_GUIDE.md"
echo ""

# 保存密码到文件
echo "$REDIS_PASSWORD" > .redis-password
chmod 600 .redis-password
echo "✅ Redis 密码已保存到 .redis-password 文件"
echo ""

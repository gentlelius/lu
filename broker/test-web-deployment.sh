#!/bin/bash

# Web 部署测试脚本

echo "🧪 测试 Web 部署配置..."
echo ""

# 检查必要的文件
echo "1️⃣ 检查文件..."

if [ ! -f "../app/package.json" ]; then
    echo "❌ 错误：找不到 app/package.json"
    exit 1
fi

if [ ! -f "package.json" ]; then
    echo "❌ 错误：找不到 broker/package.json"
    exit 1
fi

if [ ! -f "src/main.ts" ]; then
    echo "❌ 错误：找不到 broker/src/main.ts"
    exit 1
fi

echo "✅ 所有必要文件存在"
echo ""

# 检查 app 的构建脚本
echo "2️⃣ 检查 app 构建脚本..."
if grep -q "build:web" ../app/package.json; then
    echo "✅ app 有 build:web 脚本"
else
    echo "❌ 错误：app 缺少 build:web 脚本"
    exit 1
fi
echo ""

# 检查 broker 的构建脚本
echo "3️⃣ 检查 broker 构建脚本..."
if grep -q "build:all" package.json; then
    echo "✅ broker 有 build:all 脚本"
else
    echo "❌ 错误：broker 缺少 build:all 脚本"
    exit 1
fi
echo ""

# 检查 main.ts 是否配置了静态文件服务
echo "4️⃣ 检查静态文件服务配置..."
if grep -q "useStaticAssets" src/main.ts; then
    echo "✅ main.ts 已配置静态文件服务"
else
    echo "❌ 错误：main.ts 未配置静态文件服务"
    exit 1
fi
echo ""

# 检查部署脚本
echo "5️⃣ 检查部署脚本..."
if [ -f "deploy-web.sh" ] && [ -x "deploy-web.sh" ]; then
    echo "✅ deploy-web.sh 存在且可执行"
else
    echo "⚠️  警告：deploy-web.sh 不存在或不可执行"
    echo "   运行: chmod +x deploy-web.sh"
fi
echo ""

# 检查文档
echo "6️⃣ 检查文档..."
docs_count=0
[ -f "../docs/WEB_DEPLOYMENT.md" ] && ((docs_count++))
[ -f "../docs/WEB_QUICK_START.md" ] && ((docs_count++))
[ -f "../docs/WEB_DEPLOYMENT_SUMMARY.md" ] && ((docs_count++))
[ -f "../docs/nginx-config-example.conf" ] && ((docs_count++))

echo "✅ 找到 $docs_count/4 个文档文件"
echo ""

# 检查 node_modules
echo "7️⃣ 检查依赖..."
if [ -d "node_modules" ]; then
    echo "✅ broker 依赖已安装"
else
    echo "⚠️  警告：broker 依赖未安装"
    echo "   运行: npm install"
fi

if [ -d "../app/node_modules" ]; then
    echo "✅ app 依赖已安装"
else
    echo "⚠️  警告：app 依赖未安装"
    echo "   运行: cd ../app && npm install"
fi
echo ""

# 总结
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ 配置检查完成！"
echo ""
echo "📝 下一步："
echo "   1. 如果依赖未安装，运行："
echo "      cd ../app && npm install"
echo "      cd ../broker && npm install"
echo ""
echo "   2. 构建和部署："
echo "      ./deploy-web.sh"
echo ""
echo "   3. 启动服务："
echo "      npm run pm2:start"
echo ""
echo "   4. 访问应用："
echo "      http://localhost:3000"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

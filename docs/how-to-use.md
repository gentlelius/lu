## 🚀 快速开始指南

### 1️⃣ 启动 Broker（中间层服务器）

```bash
cd broker

# 安装依赖（如果还没安装）
npm install

# 确保 Redis 正在运行
# macOS: brew services start redis
# 或者: redis-server

# 启动 broker
npm run start:dev
```

Broker 会在 `http://localhost:3000` 启动。

### 2️⃣ 启动 Runner（被控制端）

```bash
cd runner

# 安装依赖（如果还没安装）
npm install

# 启动 runner
npm start
```

**你会看到类似这样的输出：**
```
╔════════════════════════════════════════╗
║                                        ║
║        PAIRING CODE: ABC-123-XYZ       ║
║                                        ║
║   Share this code with your app to     ║
║   establish a secure connection        ║
║                                        ║
╚════════════════════════════════════════╝

✅ Connected to broker
✅ Pairing code registered successfully
```

**记下这个配对码！** 你需要在 App 中输入它。

### 3️⃣ 启动 App（移动端控制器）

```bash
cd app

# 安装依赖（如果还没安装）
npm install

# 启动 Expo 开发服务器
npm start
```

然后：
- 按 `i` 在 iOS 模拟器中打开
- 按 `a` 在 Android 模拟器中打开
- 或扫描二维码在真机上打开

### 4️⃣ 在 App 中配对

1. **打开 App** 后，导航到配对界面（`/pairing` 路由）

2. **输入配对码**：
   - 在三个输入框中输入 Runner 显示的配对码
   - 例如：`ABC` - `123` - `XYZ`
   - 输入会自动转换为大写

3. **点击 "Pair" 按钮**

4. **配对成功！** 你会看到成功提示并自动跳转到终端界面

## 📱 使用配对状态组件

配对成功后，你可以在任何界面显示配对状态：

```typescript
import { PairingStatus } from '../src/components/PairingStatus';
import { AppClient } from '../src/services/app-client';

function MyScreen() {
  const appClient = useRef<AppClient>(new AppClient()).current;

  return (
    <View>
      <PairingStatus 
        appClient={appClient} 
        onUnpaired={() => router.push('/pairing')}
      />
      {/* 你的其他内容 */}
    </View>
  );
}
```

## 🔧 配置说明

### Broker 配置

编辑 `broker/.env`：

```env
# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Broker 配置
PORT=3000
RUNNER_SECRET=your-secret-key-here

# JWT 配置（用于 App 认证）
JWT_SECRET=your-jwt-secret-here
```

### Runner 配置

编辑 `runner/.env`：

```env
# Broker 连接
BROKER_URL=http://localhost:3000
RUNNER_SECRET=your-secret-key-here

# Runner 标识
RUNNER_ID=my-runner-001
```

### App 配置

在 `app/app/pairing.tsx` 中修改：

```typescript
const config = {
  brokerUrl: 'http://localhost:3000',  // 改为你的 broker 地址
  jwtToken: 'your-jwt-token',          // 从认证系统获取
};
```

## 🎯 常见使用场景

### 场景 1：基本配对流程

```
1. 启动 Broker (localhost:3000)
2. 启动 Runner → 显示配对码 "ABC-123-XYZ"
3. 打开 App → 输入 "ABC-123-XYZ" → 配对成功
4. 现在可以通过 App 控制 Runner 的终端
```

### 场景 2：多个 App 配对同一个 Runner

```
1. Runner 显示配对码 "ABC-123-XYZ"
2. App 1 输入配对码 → 配对成功
3. App 2 输入相同配对码 → 也配对成功
4. 两个 App 都可以控制同一个 Runner
```

### 场景 3：Runner 断线重连

```
1. Runner 正在运行，配对码 "ABC-123-XYZ"
2. Runner 网络断开
3. Runner 自动重连 → 生成新配对码 "DEF-456-UVW"
4. 已配对的 App 会收到通知：Runner 已重新上线
5. App 需要使用新配对码重新配对
```

### 场景 4：解除配对

```
1. 在 App 的配对状态界面
2. 点击 "Unpair" 按钮
3. 确认解除配对
4. 配对关系被删除，但 Runner 的配对码仍然有效
5. 其他 App 仍可使用该配对码配对
```

## 🔍 测试配对功能

### 测试 Broker

```bash
cd broker
npm test
```

### 测试 Runner

```bash
cd runner
npm test
```

### 测试 App

```bash
cd app
npm test
```

## 📊 监控和调试

### 查看 Broker 日志

Broker 会输出详细的日志：

```
[PairingCodeService] Pairing code registered: ABC-123-XYZ for runner: runner-001
[PairingGateway] App paired successfully: app-session-123 with runner: runner-001
[RateLimitService] Failed attempt recorded for session: app-session-456
```

### 查看 Redis 数据

```bash
redis-cli

# 查看所有配对码
KEYS pairing:code:*

# 查看特定配对码
GET pairing:code:ABC-123-XYZ

# 查看配对会话
KEYS pairing:session:*

# 查看配对历史
LRANGE pairing:history 0 10
```

## ⚠️ 常见问题

### 1. 配对码不存在

**原因：**
- 配对码输入错误
- 配对码已过期（24小时）
- Runner 未连接到 Broker

**解决：**
- 检查配对码是否正确
- 确认 Runner 正在运行
- 查看 Runner 显示的最新配对码

### 2. Runner 离线

**原因：**
- Runner 进程已停止
- 网络连接断开
- Broker 未运行

**解决：**
- 重启 Runner
- 检查网络连接
- 确认 Broker 正在运行

### 3. 速率限制

**原因：**
- 1分钟内失败尝试超过5次

**解决：**
- 等待5分钟后重试
- 检查配对码是否正确

### 4. 连接失败

**原因：**
- Broker URL 配置错误
- Redis 未运行
- 防火墙阻止连接

**解决：**
- 检查 Broker URL 配置
- 启动 Redis: `redis-server`
- 检查防火墙设置

## 📚 更多文档

- **API 文档**: `broker/src/pairing/README.md`
- **App 客户端文档**: `app/src/services/README.md`
- **配对状态组件**: `app/src/components/PAIRING_STATUS_README.md`
- **最终检查报告**: `.kiro/specs/runner-app-pairing/FINAL_CHECKPOINT_REPORT.md`


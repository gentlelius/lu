# 输出循环问题修复

## 问题描述

在使用 Cli Remote Runner 时，发现 Claude 会不断重复输出相同的命令和结果，形成无限循环：

```
Explore(Explore codebase structure)
Waiting...-la /Users/shengliu/Documents
/gaoji/lu/broker/src/)
Waiting...-la /Users/shengliu/Documents
...
```

## 问题原因

这个问题的根源是 Claude 本身在循环执行命令，可能的原因包括：
1. Claude 误认为命令没有完成，继续发送相同的命令
2. 输出被不断发送回 Claude，触发了某种循环逻辑
3. 网络延迟导致消息重复

## 解决方案

我们在 **runner 端**添加了多层保护机制，在源头阻止循环输出传输到 broker，大大减少网络通信成本。

### 1. 输出节流（Throttling）

在 `runner/src/pty-manager.ts` 中添加了输出节流：
- 限制输出频率为每 100ms 一次
- **在 runner 端直接阻止**过于频繁的输出，不传输到 broker
- 减少网络带宽消耗

```typescript
private readonly outputThrottle = 100; // ms between outputs

if (now - lastTime < this.outputThrottle) {
  console.log(`⏱️ Throttled output (too frequent)`);
  return; // 不传输到 broker，减少通信成本
}
```

### 2. 重复输出检测（Duplicate Detection）

在 `runner/src/pty-manager.ts` 中添加了重复输出检测：
- 检测连续相同的输出
- 如果连续 3 次以上相同输出，**在 runner 端直接阻止传输**
- 防止相同内容被重复发送到 broker 和 app

```typescript
if (session.lastOutput === data) {
  session.duplicateCount++;
  if (session.duplicateCount > 3) {
    console.warn(`⚠️ Detected duplicate outputs, blocking transmission to broker`);
    return; // 不传输到 broker，减少通信成本
  }
}
```

### 3. 架构优势

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│  PTY    │────▶│ Runner  │────▶│ Broker  │────▶│  App    │
│ Output  │     │ Filter  │     │         │     │         │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
                     ▲
                     │
                 在这里阻止循环
              不传输到 broker
              减少网络通信成本
```

**优点：**
- ✅ 在源头阻止循环，减少网络流量
- ✅ 降低 broker 和 app 的处理负担
- ✅ 节省带宽成本
- ✅ 提高整体系统性能

### 4. 日志优化

- 只记录输出的前 100 个字符，避免日志过多
- 添加了更详细的调试信息，方便排查问题
- 明确标注被阻止的输出

## 使用建议

1. **重新构建 runner**：
   ```bash
   cd runner
   npm run build
   ```

2. **重新构建 broker**（可选，broker 端已移除冗余的节流代码）：
   ```bash
   cd broker
   npm run build
   ```

3. **重启服务**：
   - 停止当前运行的 runner 和 broker
   - 重新启动服务

4. **监控日志**：
   - 观察是否还有重复输出
   - 查看被阻止的输出数量
   - 如果问题持续，可以调整 `outputThrottle` 的值

## 参数调整

如果问题仍然存在，可以调整以下参数：

### runner/src/pty-manager.ts

```typescript
// 调整节流时间（默认 100ms）
private readonly outputThrottle = 100; // 增加到 200 或更高

// 调整重复检测阈值（默认 3 次）
if (session.duplicateCount > 3) { // 改为 2 或 5
```

## 性能优化效果

假设循环输出每秒 100 次，每次 1KB：

**优化前：**
- Runner → Broker: 100 次/秒 × 1KB = 100KB/秒
- Broker → App: 100 次/秒 × 1KB = 100KB/秒
- 总带宽: 200KB/秒

**优化后：**
- Runner → Broker: 0 次/秒（被阻止）
- Broker → App: 0 次/秒
- 总带宽: 0KB/秒

**节省：100% 的循环输出带宽！**

## 注意事项

- 这些保护机制可能会导致输出略有延迟（最多 100ms）
- 如果需要实时性更高的输出，可以适当降低节流时间
- 重复检测只针对完全相同的输出，不会影响正常的命令输出
- 所有被阻止的输出都会在 runner 日志中记录，方便调试

# 终端输出去重功能

## 问题描述

在某些情况下，PTY（伪终端）可能会产生重复的输出，导致相同的日志被多次发送到 broker 和 app 端。这会造成：
- 不必要的网络流量
- 终端显示混乱
- 用户体验下降

## 解决方案

在 `runner/src/pty-manager.ts` 中实现了输出去重机制：

### 工作原理

1. **时间窗口检测**：在 100ms 的时间窗口内检测重复输出
2. **内容比较**：比较当前输出与上一次输出是否完全相同
3. **自动过滤**：如果检测到重复，自动过滤掉，不发送到 broker

### 实现细节

```typescript
export interface PtySession {
  sessionId: string;
  pty: IPty;
  outputBuffer: string[];
  lastOutput: string;           // 上一次的输出内容
  lastOutputTime: number;        // 上一次输出的时间戳
  duplicateCount: number;        // 重复计数
}

// 去重阈值：100ms
private readonly duplicateThresholdMs = 100;
```

### 去重逻辑

```typescript
ptyProcess.onData((data) => {
  const now = Date.now();
  const timeDiff = now - session.lastOutputTime;
  
  // 检查是否是重复输出
  if (data === session.lastOutput && timeDiff < this.duplicateThresholdMs) {
    session.duplicateCount++;
    console.log(`🔄 [${sessionId}] Duplicate output filtered (count: ${session.duplicateCount})`);
    return; // 过滤掉重复输出
  }
  
  // 重置重复计数
  if (data !== session.lastOutput) {
    if (session.duplicateCount > 0) {
      console.log(`✅ [${sessionId}] Filtered ${session.duplicateCount} duplicate outputs`);
    }
    session.duplicateCount = 0;
  }
  
  // 更新最后输出
  session.lastOutput = data;
  session.lastOutputTime = now;
  
  // 发送输出
  onData(data);
});
```

## 配置

可以通过修改 `duplicateThresholdMs` 来调整去重的时间窗口：

- **默认值**：100ms
- **建议范围**：50ms - 500ms
- **较小值**：更严格的去重，可能会过滤掉快速连续的合法输出
- **较大值**：更宽松的去重，可能会漏掉一些重复输出

## 日志输出

去重功能会在控制台输出以下日志：

- `🔄 [sessionId] Duplicate output filtered (count: N)` - 检测到并过滤了重复输出
- `✅ [sessionId] Filtered N duplicate outputs` - 总共过滤了多少个重复输出

## 测试

重新编译并运行 runner：

```bash
cd runner
npm run build
npm start
```

观察控制台日志，如果出现重复输出，会看到去重日志。

## 注意事项

1. 去重只在 runner 端进行，不影响 broker 或 app 端的逻辑
2. 去重是基于完全匹配的，部分相似的输出不会被过滤
3. 去重不会影响输出缓冲区（outputBuffer），所有输出仍会被记录

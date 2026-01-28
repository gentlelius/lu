# 修复经验：node-pty 在远程终端项目中的问题

## 问题背景

在开发远程 Claude Code 控制系统时，需要在 Runner 端创建一个伪终端（PTY）来运行交互式命令（如 `claude` CLI）。

## 遇到的问题

### 问题 1：使用 `child_process.spawn` 无法支持交互式程序

**症状**：

- 简单命令如 `ls` 可以正常输出
- 交互式命令如 `claude` 发送后没有任何反应

**原因**：
`child_process.spawn` 不提供真正的 TTY（伪终端）环境。很多交互式程序（如 `claude`、`vim`、`htop` 等）会检测是否运行在 TTY 中，如果不是，可能会：

- 拒绝启动
- 以非交互模式运行
- 输出到不同的流

**解决方案**：
使用 `node-pty` 替代 `child_process.spawn`，它提供真正的伪终端环境。

---

### 问题 2：`node-pty` 抛出 `posix_spawnp failed` 错误

**症状**：

```
Error: posix_spawnp failed.
    at new UnixTerminal (node_modules/node-pty/src/unixTerminal.ts:106:22)
```

**原因**：
`node-pty` 是一个 native 模块，需要针对当前系统和 Node.js 版本编译。在使用 pnpm workspace 时，native 模块可能没有正确编译。

**诊断步骤**：

1. 检查 `node-pty` 的安装位置：

   ```bash
   find . -name "node-pty" -type d
   ```

2. 检查是否有编译好的 native 模块：

   ```bash
   ls node_modules/node-pty/build/Release/
   ```

   如果目录不存在或为空，说明 native 模块没有编译。

3. 检查 Node.js 版本：
   ```bash
   node -v
   ```

**解决方案**：

手动使用 `node-gyp` 编译 native 模块：

```bash
cd node_modules/node-pty
npx node-gyp rebuild
```

编译成功后会看到：

```
gyp info ok
```

并且 `build/Release/` 目录下会有：

- `pty.node` - PTY native 绑定
- `spawn-helper` - spawn 辅助程序

---

## 最终代码

### pty-manager.ts

```typescript
import * as pty from "node-pty";
import { IPty } from "node-pty";

export interface PtySession {
  sessionId: string;
  pty: IPty;
  outputBuffer: string[];
}

export class PtyManager {
  private sessions = new Map<string, PtySession>();

  createSession(
    sessionId: string,
    onData: (data: string) => void,
    onExit: (exitCode: number | undefined) => void
  ): PtySession | null {
    const cwd = process.env.HOME || process.cwd();
    const shell = process.platform === "win32" ? "cmd.exe" : "/bin/bash";

    let ptyProcess: IPty;
    try {
      ptyProcess = pty.spawn(shell, [], {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd: cwd,
        env: process.env as { [key: string]: string },
      });
    } catch (error) {
      console.error(`❌ Failed to spawn PTY: ${error}`);
      return null;
    }

    const session: PtySession = {
      sessionId,
      pty: ptyProcess,
      outputBuffer: [],
    };

    ptyProcess.onData((data) => {
      session.outputBuffer.push(data);
      onData(data);
    });

    ptyProcess.onExit(({ exitCode }) => {
      this.sessions.delete(sessionId);
      onExit(exitCode);
    });

    this.sessions.set(sessionId, session);
    return session;
  }

  write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.pty.write(data);
    return true;
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.pty.resize(cols, rows);
    return true;
  }
}
```

---

## 关键经验总结

1. **交互式程序需要真正的 PTY**

   - `child_process.spawn` 只提供管道（pipe），不是 TTY
   - 使用 `node-pty` 可以创建真正的伪终端

2. **Native 模块需要编译**

   - `node-pty` 包含 C++ 代码，需要针对当前系统编译
   - pnpm workspace 可能导致 native 模块编译路径问题
   - 使用 `npx node-gyp rebuild` 手动编译

3. **调试技巧**

   - 添加详细的日志输出（输入、输出、错误）
   - 检查 native 模块的 `build/Release/` 目录是否存在
   - 先用简单命令（如 `echo hello`）测试，再测试复杂的交互式程序

4. **Shell 选择**
   - `/bin/bash` 通常比 `/bin/zsh` 兼容性更好
   - 设置 `name: 'xterm-256color'` 以支持彩色输出

---

## 环境信息

- macOS (darwin arm64)
- Node.js v18.17.0
- node-pty ^1.0.0
- pnpm workspace

---

_文档创建时间: 2026-01-11_

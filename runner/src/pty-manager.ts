import * as pty from 'node-pty';
import { IPty } from 'node-pty';

export interface PtySession {
  sessionId: string;
  pty: IPty;
  outputBuffer: string[];
}

export class PtyManager {
  private sessions = new Map<string, PtySession>();
  private readonly maxBufferLines = 1000;

  createSession(
    sessionId: string,
    onData: (data: string) => void,
    onExit: (exitCode: number | undefined) => void,
  ): PtySession | null {
    const cwd = process.env.HOME || process.cwd();
    
    // 使用 bash，通常更兼容
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
    
    console.log(`🚀 Spawning PTY: ${shell} in ${cwd}`);
    console.log(`   Platform: ${process.platform}, UID: ${process.getuid?.()}, GID: ${process.getgid?.()}`);

    let ptyProcess: IPty;
    try {
      ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
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

    // 监听输出
    ptyProcess.onData((data) => {
      console.log(`📤 [${sessionId}] output: ${JSON.stringify(data.substring(0, 100))}`);
      session.outputBuffer.push(data);
      if (session.outputBuffer.length > this.maxBufferLines) {
        session.outputBuffer.shift();
      }
      onData(data);
    });

    // 监听退出
    ptyProcess.onExit(({ exitCode }) => {
      console.log(`🛑 PTY exited with code ${exitCode} for session ${sessionId}`);
      this.sessions.delete(sessionId);
      onExit(exitCode);
    });

    this.sessions.set(sessionId, session);
    console.log(`📟 PTY session created: ${sessionId}`);
    
    return session;
  }

  write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    console.log(`⌨️ Writing to session ${sessionId}: ${JSON.stringify(data)}`);
    session.pty.write(data);
    return true;
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    session.pty.resize(cols, rows);
    return true;
  }

  getBuffer(sessionId: string): string[] {
    const session = this.sessions.get(sessionId);
    return session?.outputBuffer || [];
  }

  killSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.pty.kill();
      this.sessions.delete(sessionId);
      console.log(`🛑 Session killed: ${sessionId}`);
    }
  }

  killAll(): void {
    this.sessions.forEach((session) => {
      session.pty.kill();
    });
    this.sessions.clear();
  }
}

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

/** Claude history.jsonl 里每行的格式 */
export interface HistoryEntry {
  display: string;
  timestamp: number;
  project: string;
  sessionId: string;
}

/** 单条会话消息 */
export interface SessionMessage {
  uuid: string;
  parentUuid: string | null;
  type: 'user' | 'assistant' | 'system' | 'summary' | string;
  timestamp: string;
  message?: {
    role: string;
    content: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
  };
  summary?: string;
  isSidechain?: boolean;
}

/** 会话摘要（列表用） */
export interface SessionSummary {
  sessionId: string;
  projectPath: string;
  summary: string;
  lastTimestamp: string | null;
  messageCount: number;
}

/** 完整会话详情 */
export interface SessionDetail extends SessionSummary {
  messages: SessionMessage[];
}

export class HistoryReader {
  private readonly claudeDir: string;
  private readonly projectsDir: string;

  constructor() {
    this.claudeDir = path.join(os.homedir(), '.claude');
    this.projectsDir = path.join(this.claudeDir, 'projects');
  }

  /**
   * 将项目路径转换为 .claude/projects/ 子目录名
   * 规则：将路径中的 '/' 替换为 '-'，去掉开头的 '-'
   */
  private projectPathToDir(projectPath: string): string {
    return projectPath.replace(/\//g, '-').replace(/^-/, '');
  }

  /**
   * 反向：将目录名转换回项目路径
   */
  private dirToProjectPath(dirName: string): string {
    return '/' + dirName.replace(/-/g, '/');
  }

  /**
   * 读取一个 .jsonl 文件的所有行，解析为对象数组
   */
  private async readJsonl(filePath: string): Promise<SessionMessage[]> {
    const messages: SessionMessage[] = [];

    if (!fs.existsSync(filePath)) return messages;

    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        messages.push(JSON.parse(trimmed));
      } catch {
        // 跳过解析失败的行
      }
    }

    return messages;
  }

  /**
   * 从消息列表中提取摘要文本
   */
  private extractSummary(messages: SessionMessage[]): string {
    const summaryMsg = messages.find((m) => m.type === 'summary');
    if (summaryMsg?.summary) return summaryMsg.summary;
    // fallback: 取第一条用户消息的内容
    const firstUser = messages.find((m) => m.type === 'user' && m.message?.role === 'user');
    if (firstUser?.message?.content) {
      const c = firstUser.message.content;
      if (typeof c === 'string') return c.substring(0, 80);
      if (Array.isArray(c)) {
        const textPart = c.find((p) => p.type === 'text' && p.text);
        if (textPart?.text) return String(textPart.text).substring(0, 80);
      }
    }
    return '(no summary)';
  }

  /**
   * 从消息列表中取最后一条有时间戳的消息时间
   */
  private extractLastTimestamp(messages: SessionMessage[]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].timestamp) return messages[i].timestamp;
    }
    return null;
  }

  /**
   * 列出指定项目路径的所有会话摘要
   * 如果 projectPath 为空，则列出所有项目的会话
   */
  async listSessions(projectPath?: string): Promise<SessionSummary[]> {
    const results: SessionSummary[] = [];

    if (!fs.existsSync(this.projectsDir)) return results;

    const projectDirs = projectPath
      ? [this.projectPathToDir(projectPath)]
      : fs.readdirSync(this.projectsDir);

    for (const dirName of projectDirs) {
      const dirPath = path.join(this.projectsDir, dirName);
      if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) continue;

      let files: string[];
      try {
        files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.jsonl'));
      } catch {
        continue;
      }

      const projPath = projectPath || this.dirToProjectPath(dirName);

      for (const file of files) {
        const sessionId = path.basename(file, '.jsonl');
        const filePath = path.join(dirPath, file);

        try {
          const messages = await this.readJsonl(filePath);
          results.push({
            sessionId,
            projectPath: projPath,
            summary: this.extractSummary(messages),
            lastTimestamp: this.extractLastTimestamp(messages),
            messageCount: messages.filter(
              (m) => m.type === 'user' || m.type === 'assistant',
            ).length,
          });
        } catch {
          // 跳过无法读取的文件
        }
      }
    }

    // 按最后时间戳倒序排列（最新的在前）
    results.sort((a, b) => {
      if (!a.lastTimestamp && !b.lastTimestamp) return 0;
      if (!a.lastTimestamp) return 1;
      if (!b.lastTimestamp) return -1;
      return b.lastTimestamp.localeCompare(a.lastTimestamp);
    });

    return results;
  }

  /**
   * 获取某个会话的完整消息记录
   */
  async getSession(sessionId: string, projectPath?: string): Promise<SessionDetail | null> {
    if (!fs.existsSync(this.projectsDir)) return null;

    const projectDirs = projectPath
      ? [this.projectPathToDir(projectPath)]
      : fs.readdirSync(this.projectsDir);

    for (const dirName of projectDirs) {
      const filePath = path.join(this.projectsDir, dirName, `${sessionId}.jsonl`);
      if (!fs.existsSync(filePath)) continue;

      try {
        const messages = await this.readJsonl(filePath);
        const projPath = projectPath || this.dirToProjectPath(dirName);

        return {
          sessionId,
          projectPath: projPath,
          summary: this.extractSummary(messages),
          lastTimestamp: this.extractLastTimestamp(messages),
          messageCount: messages.filter(
            (m) => m.type === 'user' || m.type === 'assistant',
          ).length,
          messages,
        };
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * 检查 .claude 目录是否存在（判断本机是否安装了 Claude Code）
   */
  isClaudeInstalled(): boolean {
    return fs.existsSync(this.claudeDir);
  }
}

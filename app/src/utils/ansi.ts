// 简化的 ANSI 解析器
// 将 ANSI 转义序列转换为样式化的文本片段

export interface StyledText {
  text: string;
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

const ANSI_COLORS: Record<number, string> = {
  30: '#000000',
  31: '#ff5555',
  32: '#50fa7b',
  33: '#f1fa8c',
  34: '#6272a4',
  35: '#ff79c6',
  36: '#8be9fd',
  37: '#f8f8f2',
  90: '#6272a4',
  91: '#ff6e6e',
  92: '#69ff94',
  93: '#ffffa5',
  94: '#d6acff',
  95: '#ff92df',
  96: '#a4ffff',
  97: '#ffffff',
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: '#000000',
  41: '#ff5555',
  42: '#50fa7b',
  43: '#f1fa8c',
  44: '#6272a4',
  45: '#ff79c6',
  46: '#8be9fd',
  47: '#f8f8f2',
};

export function parseAnsi(input: string): StyledText[] {
  const result: StyledText[] = [];
  const regex = /\x1b\[([0-9;]*)m/g;
  
  let lastIndex = 0;
  let currentStyle: Partial<StyledText> = {};
  let match;

  while ((match = regex.exec(input)) !== null) {
    // 添加普通文本
    if (match.index > lastIndex) {
      const text = input.slice(lastIndex, match.index);
      if (text) {
        result.push({ text, ...currentStyle });
      }
    }

    // 解析 ANSI 代码
    const codes = match[1].split(';').map(Number);
    for (const code of codes) {
      if (code === 0) {
        currentStyle = {};
      } else if (code === 1) {
        currentStyle.bold = true;
      } else if (code === 3) {
        currentStyle.italic = true;
      } else if (code === 4) {
        currentStyle.underline = true;
      } else if (ANSI_COLORS[code]) {
        currentStyle.color = ANSI_COLORS[code];
      } else if (ANSI_BG_COLORS[code]) {
        currentStyle.backgroundColor = ANSI_BG_COLORS[code];
      }
    }

    lastIndex = regex.lastIndex;
  }

  // 添加剩余文本
  if (lastIndex < input.length) {
    const text = input.slice(lastIndex);
    if (text) {
      result.push({ text, ...currentStyle });
    }
  }

  return result;
}

// 移除所有 ANSI 转义序列
export function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, '');
}

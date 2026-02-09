# Terminal 实现说明

## 概述

XTerminal 组件现在支持两种渲染模式：

1. **React Native (iOS/Android)**: 使用 WebView 嵌套 iframe 渲染 xterm.js
2. **Web**: 直接使用 xterm.js 组件渲染，无需 iframe 嵌套

## 实现细节

### Web 平台

- 直接导入 xterm.js 库及其插件
- 使用 React ref 管理 DOM 容器
- 动态导入模块以避免在 RN 环境中加载
- 自动适配窗口大小变化

### React Native 平台

- 保持原有的 WebView + iframe 实现
- 通过 postMessage 与 iframe 通信
- 使用 base64 编码传输数据

## 依赖

```json
{
  "xterm": "^5.3.0",
  "xterm-addon-fit": "^0.8.0",
  "xterm-addon-web-links": "^0.9.0"
}
```

## 使用方式

```tsx
import { XTerminal, XTerminalRef } from '../src/components/XTerminal';

const terminalRef = useRef<XTerminalRef>(null);

<XTerminal
  ref={terminalRef}
  onInput={handleTerminalInput}
  fontSize={14}
/>
```

## 优势

### Web 平台优势
- 更好的性能（无 iframe 开销）
- 更简单的通信机制
- 更好的调试体验
- 直接访问 xterm.js API

### RN 平台
- 保持稳定的现有实现
- 跨平台一致的 API

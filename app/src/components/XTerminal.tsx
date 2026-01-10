import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

// 动态导入 WebView - 只在原生平台使用
let WebView: any = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

interface XTerminalProps {
  onInput?: (data: string) => void;
  fontSize?: number;
  theme?: 'dark' | 'light';
}

export interface XTerminalRef {
  write: (data: string) => void;
  clear: () => void;
  focus: () => void;
}

// xterm.js HTML 模板
const getTerminalHTML = (fontSize: number = 14) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css" />
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #1a1a2e;
    }
    #terminal {
      width: 100%;
      height: 100%;
    }
    .xterm {
      padding: 8px;
    }
    .xterm-viewport::-webkit-scrollbar {
      width: 8px;
    }
    .xterm-viewport::-webkit-scrollbar-track {
      background: #1a1a2e;
    }
    .xterm-viewport::-webkit-scrollbar-thumb {
      background: #313244;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div id="terminal"></div>
  <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.min.js"></script>
  <script>
    // 调试日志
    function debugLog(msg) {
      console.log('[XTerm]', msg);
    }

    // 统一的消息发送函数
    function postMessage(data) {
      // 原生: ReactNativeWebView, Web: parent.postMessage
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      } else {
        window.parent.postMessage({ source: 'xterm', ...data }, '*');
      }
    }

    try {
      debugLog('Initializing xterm...');
      
      const theme = {
        background: '#1a1a2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        cursorAccent: '#1e1e2e',
        selectionBackground: '#585b70',
        selectionForeground: '#cdd6f4',
        black: '#45475a',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#f5c2e7',
        cyan: '#94e2d5',
        white: '#bac2de',
        brightBlack: '#585b70',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#f5c2e7',
        brightCyan: '#94e2d5',
        brightWhite: '#a6adc8',
      };

      const terminal = new Terminal({
        fontSize: ${fontSize},
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: theme,
        cursorBlink: true,
        cursorStyle: 'bar',
        allowTransparency: true,
        scrollback: 5000,
        convertEol: true,
      });

      const fitAddon = new FitAddon.FitAddon();
      const webLinksAddon = new WebLinksAddon.WebLinksAddon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);

      terminal.open(document.getElementById('terminal'));
      fitAddon.fit();
      debugLog('Terminal opened, cols=' + terminal.cols + ', rows=' + terminal.rows);

      window.addEventListener('resize', function() {
        fitAddon.fit();
        postMessage({ type: 'resize', cols: terminal.cols, rows: terminal.rows });
      });

      setTimeout(function() {
        fitAddon.fit();
        postMessage({ type: 'resize', cols: terminal.cols, rows: terminal.rows });
      }, 100);

      terminal.onData(function(data) {
        postMessage({ type: 'input', data: data });
      });

      // 处理来自 React 的消息
      window.handleMessage = function(message) {
        try {
          var parsed = typeof message === 'string' ? JSON.parse(message) : message;
          var type = parsed.type;
          var data = parsed.data;
          switch (type) {
            case 'write':
              terminal.write(data);
              break;
            case 'clear':
              terminal.clear();
              break;
            case 'focus':
              terminal.focus();
              break;
            case 'resize':
              terminal.resize(data.cols, data.rows);
              break;
          }
        } catch (e) {
          debugLog('Error: ' + e.message);
        }
      };

      // Web 模式: 监听来自 parent 的消息
      window.addEventListener('message', function(event) {
        if (event.data && event.data.source === 'react') {
          window.handleMessage(event.data);
        }
      });

      postMessage({ type: 'ready' });
      debugLog('Terminal ready!');

    } catch (e) {
      debugLog('Fatal error: ' + e.message);
      document.body.innerHTML = '<pre style="color:red;padding:20px;">Error: ' + e.message + '</pre>';
    }
  </script>
</body>
</html>
`;

// Web 平台实现 - 使用 iframe
const XTerminalWeb = forwardRef<XTerminalRef, XTerminalProps>(
  ({ onInput, fontSize = 14 }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const isReady = useRef(false);
    const pendingWrites = useRef<string[]>([]);

    // 发送消息到 iframe
    const sendMessage = useCallback((type: string, data?: any) => {
      if (iframeRef.current?.contentWindow && isReady.current) {
        iframeRef.current.contentWindow.postMessage(
          { source: 'react', type, data },
          '*'
        );
      }
    }, []);

    useImperativeHandle(ref, () => ({
      write: (data: string) => {
        if (isReady.current) {
          sendMessage('write', data);
        } else {
          pendingWrites.current.push(data);
        }
      },
      clear: () => sendMessage('clear'),
      focus: () => sendMessage('focus'),
    }), [sendMessage]);

    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.source === 'xterm') {
          switch (event.data.type) {
            case 'ready':
              isReady.current = true;
              pendingWrites.current.forEach(data => sendMessage('write', data));
              pendingWrites.current = [];
              break;
            case 'input':
              onInput?.(event.data.data);
              break;
            case 'resize':
              console.log(`📐 Terminal resized: ${event.data.cols}x${event.data.rows}`);
              break;
          }
        }
      };

      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }, [onInput, sendMessage]);

    const htmlContent = getTerminalHTML(fontSize);
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    return (
      <View style={styles.container}>
        <iframe
          ref={iframeRef as any}
          src={url}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            backgroundColor: '#1a1a2e',
          }}
        />
      </View>
    );
  }
);

// 原生平台实现 - 使用 WebView
const XTerminalNative = forwardRef<XTerminalRef, XTerminalProps>(
  ({ onInput, fontSize = 14 }, ref) => {
    const webViewRef = useRef<any>(null);
    const isReady = useRef(false);
    const pendingWrites = useRef<string[]>([]);

    const sendMessage = useCallback((type: string, data?: any) => {
      if (webViewRef.current && isReady.current) {
        const message = JSON.stringify({ type, data });
        const encoded = btoa(encodeURIComponent(message));
        webViewRef.current.injectJavaScript(`
          try {
            var decoded = decodeURIComponent(atob('${encoded}'));
            window.handleMessage(decoded);
          } catch(e) {
            console.error('Decode error:', e);
          }
          true;
        `);
      }
    }, []);

    useImperativeHandle(ref, () => ({
      write: (data: string) => {
        if (isReady.current) {
          sendMessage('write', data);
        } else {
          pendingWrites.current.push(data);
        }
      },
      clear: () => sendMessage('clear'),
      focus: () => sendMessage('focus'),
    }), [sendMessage]);

    const handleMessage = useCallback((event: any) => {
      try {
        const message = JSON.parse(event.nativeEvent.data);
        switch (message.type) {
          case 'ready':
            isReady.current = true;
            pendingWrites.current.forEach(data => sendMessage('write', data));
            pendingWrites.current = [];
            break;
          case 'input':
            onInput?.(message.data);
            break;
          case 'resize':
            console.log(`📐 Terminal resized: ${message.cols}x${message.rows}`);
            break;
        }
      } catch (e) {
        console.error('Failed to parse WebView message:', e);
      }
    }, [onInput, sendMessage]);

    if (!WebView) {
      return <View style={styles.container} />;
    }

    return (
      <View style={styles.container}>
        <WebView
          ref={webViewRef}
          source={{ html: getTerminalHTML(fontSize) }}
          style={styles.webView}
          onMessage={handleMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          scrollEnabled={false}
          bounces={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          originWhitelist={['*']}
          mixedContentMode="compatibility"
        />
      </View>
    );
  }
);

// 导出跨平台组件
export const XTerminal = Platform.OS === 'web' ? XTerminalWeb : XTerminalNative;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

import * as dotenv from 'dotenv';
import { loadConfig } from './config';
import { SocketClient } from './socket-client';
import { RunnerClient } from './runner-client';

// 加载环境变量
dotenv.config();

const config = loadConfig();

// Initialize both clients
const socketClient = new SocketClient(config);
const runnerClient = new RunnerClient(config);

console.log('🚀 Starting Runner...');
console.log(`   Runner ID: ${config.runnerId}`);
console.log(`   Broker URL: ${config.brokerUrl}`);

// Connect the pairing client first
runnerClient.connect();

// Then connect the socket client for PTY functionality
socketClient.connect();

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  runnerClient.disconnect();
  socketClient.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down...');
  runnerClient.disconnect();
  socketClient.disconnect();
  process.exit(0);
});

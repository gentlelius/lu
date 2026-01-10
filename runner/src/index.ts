import * as dotenv from 'dotenv';
import { loadConfig } from './config';
import { SocketClient } from './socket-client';

// 加载环境变量
dotenv.config();

const config = loadConfig();
const client = new SocketClient(config);

console.log('🚀 Starting Runner...');
console.log(`   Runner ID: ${config.runnerId}`);
console.log(`   Broker URL: ${config.brokerUrl}`);

client.connect();

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  client.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down...');
  client.disconnect();
  process.exit(0);
});

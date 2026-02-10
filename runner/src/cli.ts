#!/usr/bin/env node

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { createRunner } from './runner';

// 加载环境变量
// 优先级: 当前目录 .env > 用户目录 .env
const localEnv = path.join(process.cwd(), '.env');
const homeEnv = path.join(process.env.HOME || process.env.USERPROFILE || '', '.runner.env');

if (fs.existsSync(localEnv)) {
  dotenv.config({ path: localEnv });
} else if (fs.existsSync(homeEnv)) {
  dotenv.config({ path: homeEnv });
}

// 解析命令行参数
const args = process.argv.slice(2);
const flags: Record<string, string> = {};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const value = args[i + 1];
    if (value && !value.startsWith('--')) {
      flags[key] = value;
      i++;
    }
  }
}

// 命令行参数覆盖环境变量
if (flags.url) process.env.BROKER_URL = flags.url;
if (flags.id) process.env.RUNNER_ID = flags.id;
if (flags.secret) process.env.RUNNER_SECRET = flags.secret;

// 显示帮助信息
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Cli Remote Runner CLI

Usage:
  runner [options]

Options:
  --url <url>        Broker server URL (default: http://115.191.40.55:3000)
  --id <id>          Runner ID (default: runner-1)
  --secret <secret>  Runner secret for authentication
  --help, -h         Show this help message

Environment Variables:
  BROKER_URL         Broker server URL
  RUNNER_ID          Runner ID
  RUNNER_SECRET      Runner secret

Configuration Files (priority order):
  1. .env in current directory
  2. .runner.env in home directory

Example:
  runner --url https://broker.example.com --id my-runner --secret my-secret
  `);
  process.exit(0);
}

const runner = createRunner();

runner.start();

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  runner.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down...');
  runner.stop();
  process.exit(0);
});

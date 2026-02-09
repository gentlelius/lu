import * as dotenv from 'dotenv';
import { createRunner } from './runner';

dotenv.config();

const runner = createRunner();
runner.start();

const shutdown = (): void => {
  console.log('\n👋 Shutting down...');
  runner.stop();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

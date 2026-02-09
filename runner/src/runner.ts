import { Config, loadConfig } from './config';
import { RunnerClient } from './runner-client';
import { SocketClient } from './socket-client';

/**
 * High-level runner orchestrator.
 *
 * Encapsulates pairing and PTY socket clients so consumers can control
 * lifecycle via start/stop from npm package API.
 */
export class Runner {
  private readonly runnerClient: RunnerClient;
  private readonly socketClient: SocketClient;
  private started = false;

  constructor(private readonly config: Config = loadConfig()) {
    this.runnerClient = new RunnerClient(config);
    this.socketClient = new SocketClient(config);
  }

  start(): void {
    if (this.started) {
      return;
    }

    console.log('🚀 Starting Runner...');
    console.log(`   Runner ID: ${this.config.runnerId}`);
    console.log(`   Broker URL: ${this.config.brokerUrl}`);

    this.runnerClient.connect();
    this.socketClient.connect();
    this.started = true;
  }

  stop(): void {
    this.runnerClient.disconnect();
    this.socketClient.disconnect();
    this.started = false;
  }

  getConfig(): Config {
    return this.config;
  }
}

export function createRunner(config: Config = loadConfig()): Runner {
  return new Runner(config);
}

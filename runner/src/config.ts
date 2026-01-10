export interface Config {
  brokerUrl: string;
  runnerId: string;
  runnerSecret: string;
}

export function loadConfig(): Config {
  return {
    brokerUrl: process.env.BROKER_URL || 'http://localhost:3000',
    runnerId: process.env.RUNNER_ID || 'runner-1',
    runnerSecret: process.env.RUNNER_SECRET || 'secret-runner-1',
  };
}

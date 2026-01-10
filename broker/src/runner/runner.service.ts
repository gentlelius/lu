import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';

export interface RunnerInfo {
  id: string;
  socket: Socket;
  status: 'online' | 'busy';
  connectedAt: Date;
}

@Injectable()
export class RunnerService {
  private runners = new Map<string, RunnerInfo>();

  registerRunner(runnerId: string, socket: Socket): void {
    this.runners.set(runnerId, {
      id: runnerId,
      socket,
      status: 'online',
      connectedAt: new Date(),
    });
    console.log(`✅ Runner registered: ${runnerId}`);
  }

  unregisterRunner(runnerId: string): void {
    this.runners.delete(runnerId);
    console.log(`❌ Runner unregistered: ${runnerId}`);
  }

  getRunner(runnerId: string): RunnerInfo | undefined {
    return this.runners.get(runnerId);
  }

  getAllRunners(): RunnerInfo[] {
    return Array.from(this.runners.values());
  }

  getOnlineRunnerIds(): string[] {
    return Array.from(this.runners.keys());
  }

  setRunnerStatus(runnerId: string, status: 'online' | 'busy'): void {
    const runner = this.runners.get(runnerId);
    if (runner) {
      runner.status = status;
    }
  }
}

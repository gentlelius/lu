
import * as pty from 'node-pty';

console.log('Testing pty spawn...');
try {
  const user = process.env.USER || 'shengliu';
  const ptyProcess = pty.spawn('/usr/bin/login', ['-f', user, '/bin/zsh'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: '/tmp',
    env: process.env as { [key: string]: string },
  });
  console.log('✅ Successfully spawned pty');
  ptyProcess.onData((data) => {
    console.log('Data:', data);
    process.exit(0);
  });
  ptyProcess.write('ls\r');
} catch (e) {
  console.error('❌ Failed to spawn pty:', e);
  process.exit(1);
}

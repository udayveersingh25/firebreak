// Runs the API (with node --watch) and the Vite dev server side by side.
// Ctrl+C stops both; if either one exits on its own, the other is stopped too.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

if (!fs.existsSync(path.join(root, 'server/.env'))) {
  console.error('server/.env is missing. Copy server/.env.example to server/.env and fill it in.');
  process.exit(1);
}

const apps = ['server', 'client'];
const children = apps.map((app) =>
  spawn('npm', ['run', 'dev'], {
    cwd: path.join(root, app),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }),
);

let stopping = false;

function stopAll(exitCode) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
}

children.forEach((child, index) => {
  child.on('exit', (code) => {
    if (!stopping) console.error(`\nThe ${apps[index]} stopped (exit code ${code}). Stopping the rest.`);
    stopAll(code ?? 0);
  });
});

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

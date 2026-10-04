const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const root = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const vite = spawn(npm, ['run', 'dev'], { cwd: root, stdio: 'inherit', shell: true });
let electron;
const poll = setInterval(() => {
  http.get('http://127.0.0.1:3000', (response) => {
    response.resume();
    clearInterval(poll);
    electron = spawn(npm, ['exec', '--', 'electron', '.'], {
      cwd: root,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, THE_CONTROLLER_DEV_URL: 'http://127.0.0.1:3000' },
    });
    electron.on('exit', (code) => { vite.kill(); process.exit(code ?? 0); });
  }).on('error', () => {});
}, 300);

function shutdown() {
  clearInterval(poll);
  if (electron) electron.kill();
  vite.kill();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

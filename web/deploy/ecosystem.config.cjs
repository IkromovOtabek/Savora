/**
 * PM2 varianti (Docker'siz, Node 20 to'g'ridan-to'g'ri serverda). docs/DEPLOY.md → "B variant".
 *
 *   npm ci && npm run build
 *   cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
 *   pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup
 *
 * Ikki nusxa (3001, 3002) — nginx upstream bilan bir xil; `pm2 reload savora-a` va keyin
 * `pm2 reload savora-b` navbatma-navbat (uzilishsiz).
 * Env — web/.env (server.js uni o'zi o'qimaydi, shuning uchun node --env-file ishlatiladi).
 */
const path = require('path');

const cwd = path.join(__dirname, '..', '.next', 'standalone');
const envFile = path.join(__dirname, '..', '.env');

function app(name, port) {
  return {
    name,
    cwd,
    script: 'server.js',
    node_args: `--env-file=${envFile}`,
    env: { NODE_ENV: 'production', PORT: String(port), HOSTNAME: '127.0.0.1' },
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '700M',
    kill_timeout: 20000,
    time: true,
    out_file: '/var/log/savora/app.out.log',
    error_file: '/var/log/savora/app.err.log',
    merge_logs: true,
  };
}

module.exports = {
  apps: [app('savora-a', 3001), app('savora-b', 3002)],
};

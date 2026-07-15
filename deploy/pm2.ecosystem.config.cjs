// EAS PM2 ecosystem — production
// Secrets live in /etc/eas/secrets.env (chmod 600, root:root). PM2 sources it.
// Run: `sudo bash -c 'set -a; . /etc/eas/secrets.env; set +a; pm2 start /home/kyle.t/Workspace/eas/deploy/pm2.ecosystem.config.cjs --env production && pm2 save'`
const fs = require('fs');
const path = require('path');

// Prefer /etc/eas/secrets.env (production), fall back to services/api/.env (dev).
const candidates = ['/etc/eas/secrets.env', path.resolve(__dirname, '..', 'services', 'api', '.env')];
for (const envFile of candidates) {
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
    break;
  }
}

module.exports = {
  apps: [
    {
      name: 'eas-api',
      cwd: '/home/kyle.t/Workspace/eas/services/api',
      script: 'dist/src/main.js',
      interpreter: 'node',
      // 'node' interpreter runs the script file via `node script.js` — needed
      // because the dist/*.js output has no shebang, so 'none' would try to
      // exec it as a binary and fail.
      env: {
        NODE_ENV: 'production',
        API_PORT: 4000,
        DATABASE_URL: process.env.EAS_DATABASE_URL,
        AUTH_SECRET: process.env.EAS_AUTH_SECRET,
        QR_HMAC_SECRET: process.env.EAS_QR_HMAC_SECRET,
        AUTH_TOKEN_TTL: '24h',
        CORS_ORIGIN: 'https://web.eas.arrowtest.site,https://scanner.eas.arrowtest.site,http://localhost:3016,http://localhost:5173',
        PUBLIC_BASE_URL: 'https://eas.arrowtest.site',
      },
      max_memory_restart: '512M',
    },
    {
      name: 'eas-web',
      cwd: '/home/kyle.t/Workspace/eas/services/web',
      script: 'node_modules/next/dist/bin/next',
      // Port collision hell on vmi3062768. The antigravity language_server_linux_x64
      // process (a child of /home/kyle.t/.antigravity-server/) opens 4-5 sequential
      // ports in the 3011-3015+ range at startup. The first port it doesn't grab is
      // 3016 in the current state, but the LSP can shift its range after restarts.
      // The discovery command below returns the first free port; re-run before each
      // restart:
      //   for p in $(seq 3015 3200); do ss -tln 'sport = :'$p -H 2>/dev/null \
      //     | grep -q LISTEN || { echo "FIRST FREE: $p"; break; }; done
      // Port history:
      //   :3010 — PM2 god daemon (returns 200 to any GET, treat as in-use)
      //   :3011 — antigravity-server main
      //   :3012-3015 — language_server (4-5 sequential ports)
      // :3016 is the current first-free port.
      args: 'start -p 3016',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '512M',
    },
    {
      name: 'eas-scanner',
      cwd: '/home/kyle.t/Workspace/eas/services/scanner',
      script: 'node_modules/vite/bin/vite.js',
      args: 'preview --port 5173 --host 127.0.0.1',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '256M',
    },
  ],
};

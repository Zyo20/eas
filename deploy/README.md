# EAS — Deploy

## Architecture on vmi3062768

```
Internet
   ↓
*.arrowtest.site (Caddy on :80/:443, auto-LE)
   ↓
 ┌──────────────────┬──────────────────┬──────────────────┐
 │  eas. (public)   │  web. (admin)    │  scanner. (PWA)  │
 │  :4000 (api)     │  :3011 (next)    │  :5173 (vite)     │
 │  + /check-in     │                  │                  │
 └──────────────────┴──────────────────┴──────────────────┘
                              │
                              └→ api.eas.arrowtest.site → :4000 (api)
```

- **Caddy** auto-issues Let's Encrypt for all subdomains (DNS already points them to vmi3062768)
- **PM2** runs the three services as `eas-api`, `eas-web`, `eas-scanner`
- **Docker** runs only the postgres container (`eas-pg` on :5432)
- **Node 24.15.0** via nvm is already installed at `/home/kyle.t/.nvm/versions/node/v24.15.0/`

## One-time setup

```bash
# 1. Create the secrets file
sudo mkdir -p /etc/eas
sudo tee /etc/eas/secrets.env > /dev/null <<'EOF'
EAS_DATABASE_URL=postgresql://eas:$(docker exec eas-pg printenv POSTGRES_PASSWORD)@localhost:5432/eas
EAS_AUTH_SECRET=$(openssl rand -base64 32)
EAS_QR_HMAC_SECRET=$(openssl rand -base64 64)
EOF
sudo chmod 600 /etc/eas/secrets.env

# 2. Add the Caddy vhost snippet to /etc/caddy/Caddyfile
cat /home/kyle.t/Workspace/eas/deploy/Caddyfile.snippet | sudo tee -a /etc/caddy/Caddyfile
sudo systemctl reload caddy

# 3. Start PM2
sudo bash -c 'set -a; . /etc/eas/secrets.env; set +a; \
  cd /home/kyle.t/Workspace/eas && \
  pm2 start deploy/pm2.ecosystem.config.cjs && \
  pm2 save && \
  pm2 startup'
```

## Daily operations

```bash
pm2 list                           # show all 3 services
pm2 logs eas-api                   # tail API logs
pm2 restart eas-api                # bounce API
pm2 monit                          # live CPU/mem

# After code changes:
cd /home/kyle.t/Workspace/eas
git pull                           # or whatever sync
pnpm install --ignore-scripts
cd services/api && pnpm run build  # tsc check
cd ../web && pnpm run build
cd ../scanner && pnpm run build
pm2 restart all

# Backup the DB
docker exec eas-pg pg_dump -U eas eas | gzip > ~/backups/eas-$(date +%F).sql.gz
```

## Health check

```bash
curl -s https://api.eas.arrowtest.site/health    # {"ok":true,...}
curl -s https://web.eas.arrowtest.site/          # 200, Next.js HTML
curl -s https://scanner.eas.arrowtest.site/      # 200, PWA shell
curl -s https://eas.arrowtest.site/check-in/non-existent  # 404 (expected)
```

## Domain / DNS

All four subdomains (`eas.`, `web.`, `api.`, `scanner.`) already resolve to `194.233.71.16`. Caddy issues certs on first request — no DNS work needed.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Caddy 502 | PM2 service not running | `pm2 list` and `pm2 restart <name>` |
| Login 401 for valid creds | DB or `.env` drift | `docker exec eas-pg printenv POSTGRES_PASSWORD` should match `EAS_DATABASE_URL` |
| Scanner shows "Camera unavailable" | iOS Safari needs HTTPS | Make sure `scanner.eas.arrowtest.site` is being used, not localhost |
| Replays not deduping | Postgres unique constraint removed | Check schema: `@@unique([eventId, idempotencyKey])` on `AttendanceRecord` |

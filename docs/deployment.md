# Deployment and smoke test

This is the operator runbook for shipping Nujum: the bot on an Oracle Cloud VPS (Docker + Caddy) and
the dashboard on Vercel. Both deployables share only PostgreSQL and `@nujum/shared`; neither imports
the other.

```
Discord ── gateway ──> bot (VPS, Docker, private :8080)
                          │  LISTEN/NOTIFY + 10s poll
                          ▼
                   PostgreSQL (hosted, pooled URL)
                          ▲
                          │ pooled URL + HMAC-signed HTTPS
Vercel (dashboard) ── Caddy (TLS) ──> bot API /v1/*
```

Related docs: [database.md](database.md) (pooling, migrations, queues),
[bot.md](bot.md) (bot architecture/API), [tickets.md](tickets.md) (ticket/JTC lifecycle),
[security.md](security.md) (threat controls).

---

## 0. Preflight (before touching production)

Run from the repository root on the exact commit you intend to deploy:

```bash
pnpm install --frozen-lockfile
pnpm build:shared
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
```

`pnpm build` also validates the dashboard's env guard and Next.js production build. Because
`getEnv()` intentionally crashes on missing variables, supply **dummy** values only:

```bash
DATABASE_URL="postgresql://nujum:nujum@localhost:5432/nujum?schema=public" \
AUTH_SECRET="build-only-auth-secret-1234567890" \
AUTH_DISCORD_ID="123456789012345678" \
AUTH_DISCORD_SECRET="build-only-discord-secret" \
BOT_API_URL="http://localhost:4000" \
BOT_API_HMAC_SECRET="build-only-hmac-secret-0123456789abcdef" \
pnpm build
```

CI runs the same gates (`.github/workflows/ci.yml`). Do not deploy a commit that failed CI.

---

## 1. Database

1. Create a hosted PostgreSQL 15+ database (Neon recommended) in a region near the VPS. Full details
   are in [database.md §1](database.md#1-provisioning-neon).
2. Use the **pooled** URL for `DATABASE_URL` (`?sslmode=require&pgbouncer=true&connection_limit=1`
   on Vercel) and the **direct** URL for `DIRECT_URL`.
3. Apply migrations from a trusted machine or CI — never from the Vercel runtime:

   ```bash
   DIRECT_URL='postgresql://...' DATABASE_URL='postgresql://...' pnpm db:deploy
   ```

   `.github/workflows/db-migrate.yml` does this automatically when Prisma files change on `main`
   (secrets: `DATABASE_URL`, `DIRECT_URL`, environment `production`). It is forward-only and
   idempotent. Verify with `SELECT * FROM "_prisma_migrations" ORDER BY "finished_at" DESC;`.

4. Create a local backup before any destructive migration:
   `DIRECT_URL='postgresql://...' ./scripts/backup-db.sh` (see §8).

---

## 2. Discord application

1. Create the application at <https://discord.com/developers/applications> and add a bot user.
   Copy the token and application ID into `apps/bot/.env`.
2. Enable only the gateway intents the bot needs (guilds, guild members, guild messages, message
   content, voice states, reactions as documented in [bot.md](bot.md)).
3. OAuth2 → Redirects: add `<NEXT_PUBLIC_APP_URL>/api/auth/callback/discord`.
4. OAuth2 → Scopes: the dashboard requests exactly `identify guilds` — no other scopes.
5. Once commands are registered (§3.6), invite the bot with the URL produced by `/invite`. It uses
   the exact non-Administrator permission bitfield derived from the command registry.
6. Put owner ids (snowflakes) in `OWNER_IDS` on the bot and `DASHBOARD_OWNER_IDS` on the dashboard.

---

## 3. VPS (bot, direct Node.js)

Tested shape: Ubuntu 22.04 on Oracle Cloud (2 cores, ~1 GB RAM). No Docker is required — the bot runs
as a plain Node process under `systemd`.

1. Harden SSH: key-only login, disable password auth, disable root login, enable `ufw` and
   `unattended-upgrades`/`fail2ban`.
2. In **both** the Oracle VCN security list and `ufw`, allow inbound TCP `8080` from `0.0.0.0/0` (the
   dashboard calls `BOT_API_URL` over the public internet). Keep 22 restricted to your IP.
   Requests are authenticated with `BOT_API_HMAC_SECRET`; do not expose other ports.
3. Install Node 22 and pnpm:

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs git curl
   sudo npm install -g pnpm@12.23.0
   ```

4. Clone the repo and prepare env files:

   ```bash
   sudo git clone https://github.com/reapthyr/nujum.git /opt/nujum
   sudo chown -R "$USER:$USER" /opt/nujum
   cd /opt/nujum
   cp apps/bot/.env.example apps/bot/.env
   cp packages/shared/.env.example packages/shared/.env
   # fill in: token, client id, DATABASE_URL (pooled), DIRECT_URL (direct),
   # BOT_API_HMAC_SECRET (openssl rand -hex 32), OWNER_IDS
   chmod 600 apps/bot/.env packages/shared/.env
   ```

5. Install, build, and run. On small VPS instances TypeScript compilation can exceed Node's default
   heap, so raise it explicitly:

   ```bash
   cd /opt/nujum
   export NODE_OPTIONS="--max-old-space-size=1024"
   pnpm install --frozen-lockfile
   pnpm --filter @nujum/shared build
   pnpm --filter @nujum/bot build
   ```

6. Create a `systemd` service so the bot restarts automatically:

   ```bash
   sudo tee /etc/systemd/system/nujum-bot.service >/dev/null <<EOF
   [Unit]
   Description=Nujum Discord Bot
   After=network-online.target
   Wants=network-online.target

   [Service]
   Type=simple
   User=$USER
   WorkingDirectory=/opt/nujum/apps/bot
   ExecStart=$(command -v node) dist/index.js
   Restart=always
   RestartSec=5
   Environment=NODE_ENV=production

   [Install]
   WantedBy=multi-user.target
   EOF
   sudo systemctl daemon-reload
   sudo systemctl enable --now nujum-bot
   ```

   Set `BOT_API_URL` in Vercel to `http://<VPS_PUBLIC_IP>:8080` and redeploy.

7. Register slash commands once after deployment:

   ```bash
   cd /opt/nujum && pnpm --filter @nujum/bot deploy:commands
   ```

   Use `DEV_GUILD_ID` for instant registration in a test guild; omit it for global commands.

Useful probes:

```bash
curl -fsS http://127.0.0.1:8080/healthz               # liveness, 200 while process is alive
curl -fsS http://127.0.0.1:8080/readyz                # 200 only with DB + gateway ready
sudo systemctl status nujum-bot --no-pager
sudo journalctl -u nujum-bot -f
```

---

## 4. Dashboard (Vercel)

1. Import the repository into Vercel with these project settings:

   | Setting          | Value                                                       |
   | ---------------- | ----------------------------------------------------------- |
   | Root Directory   | repository root (`.`)                                       |
   | Framework        | Next.js (override detection if needed)                      |
   | Node version     | 22                                                          |
   | Install Command  | `pnpm install --frozen-lockfile`                            |
   | Build Command    | `pnpm build:shared && pnpm --filter @nujum/dashboard build` |
   | Output Directory | `apps/dashboard/.next`                                      |

   `build:shared` is required because `packages/shared/dist` is git-ignored but imported by the
   dashboard. Set **all** env vars before the first build — the env guard fails the build when one is
   missing, by design.

2. Set environment variables (Production and Preview as appropriate):

   | Variable                                                 | Source / notes                                              |
   | -------------------------------------------------------- | ----------------------------------------------------------- |
   | `DATABASE_URL`                                           | hosted **pooled** URL                                       |
   | `DIRECT_URL`                                             | hosted direct URL (migrations/Studio)                       |
   | `AUTH_SECRET`                                            | `openssl rand -base64 48`                                   |
   | `AUTH_DISCORD_ID`                                        | Discord application ID                                      |
   | `AUTH_DISCORD_SECRET`                                    | Discord OAuth client secret                                 |
   | `NEXT_PUBLIC_APP_URL`                                    | `https://dashboard.example.com`, no trailing slash          |
   | `AUTH_URL`                                               | optional; defaults to `NEXT_PUBLIC_APP_URL`                 |
   | `BOT_API_URL`                                            | `https://api.example.com` (Caddy origin, no trailing slash) |
   | `BOT_API_HMAC_SECRET`                                    | **identical** to the bot's secret                           |
   | `BOT_API_HMAC_SECRET_PREVIOUS`                           | only during rotation (§7)                                   |
   | `DASHBOARD_OWNER_IDS`                                    | comma-separated super-admin snowflakes                      |
   | `SESSION_MAX_AGE_SECONDS` / `SESSION_UPDATE_AGE_SECONDS` | defaults 28800 / 900                                        |
   | `REAUTH_WINDOW_MINUTES`                                  | default 15                                                  |
   | `DASHBOARD_RATE_LIMIT`                                   | default 120                                                 |

   Never use `NEXT_PUBLIC_*` for a secret: the build fails on purpose. Secrets are available only to
   server code. GitHub Actions secrets must be environment-scoped (`production`).

   If the variables were added only to **Production**, a plain `vercel deploy` still creates a
   **Preview** deployment and the build will fail the env guard with "Required" errors. Deploy with
   `vercel deploy --prod`, or add the same variables to Preview/Development as well.

3. Deploy, then open `https://dashboard.example.com/login` and sign in with Discord. The OAuth
   callback must be the exact redirect URI registered in §2.

---

## 5. Automated smoke test

Run from any machine that can reach both public origins. It needs Node 20+ but **no install**:

```bash
BOT_API_URL=https://api.example.com \
BOT_API_HMAC_SECRET='<the bot secret>' \
DASHBOARD_URL=https://dashboard.example.com \
node scripts/smoke-test.mjs
```

It checks, in order:

1. `/healthz` → 200 and `status: ok`.
2. `/readyz` → 200 with `database` and `gateway` both true (503 during startup is a failure).
3. `/v1/meta` without a signature → 401 (403 if an IP allowlist is configured).
4. `/v1/meta` with a tampered signature → 401.
5. `/v1/meta` with a valid signature → 200 and `apiVersion: v1`, proving Caddy TLS forwarding,
   HMAC verification and the bot API all work together.
6. Dashboard `/` → 200 (or a redirect to `/login`) when `DASHBOARD_URL` is set.

The script prints the secret never; exit code 0 means every check passed. A `BAD_SIGNATURE` failure
almost always means the two `BOT_API_HMAC_SECRET` values differ; a 403 means the smoke host is
outside `BOT_API_IP_ALLOWLIST`.

---

## 6. Manual end-to-end smoke test

Perform these after the automated checks, using a real guild and a real admin account.

| #   | Action                                                         | Expected result                                                                    |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Sign in to the dashboard; open a guild you own/manage          | Landing shows guild stats; a non-admin is refused server-side                      |
| 2   | Change a **Security** setting and save                         | Audit row with before/after diff; bot logs a config reload within ~10s, no restart |
| 3   | Publish the verification panel via **Live actions**            | Bot posts the panel; `allowedMentions.parse` is empty (no pings)                   |
| 4   | Stop the bot container; send a live message                    | UI reports `QUEUED`; a `PendingBotAction` row exists                               |
| 5   | Start the bot container                                        | Queue drains; row becomes `SENT`; Discord shows the message                        |
| 6   | Open `/dashboard/<id>/tickets`, create a category, save config | Audit entries; bot hot-reloads ticket config                                       |
| 7   | Run `/panel publish` and the dashboard publish button          | Panel message id stored; button/select opens a ticket with correct overwrites      |
| 8   | Claim, add/remove, rename, priority, note, close a ticket      | Audit entries; transcript row; channel removed; no orphan `Ticket`                 |
| 9   | Configure a JTC generator voice channel and join it            | Room created/moved with configured name/limit/bitrate; `JtcRoom` row exists        |
| 10  | Last member leaves the JTC room                                | Discord channel deleted and `JtcRoom` soft-deleted                                 |
| 11  | Revert a recent config change from **Audit**                   | Inverse write in one transaction; bot hot-reloads; new audit entry                 |
| 12  | Try a mutation with a stale/replayed signature                 | 401; auth-failure bucket increments; no state change                               |

For sensitive actions, sign in again if the session's identity check is older than
`REAUTH_WINDOW_MINUTES` (default 15). Verify details in [tickets.md](tickets.md) and
[security.md](security.md).

---

## 7. Secret rotation

HMAC secrets are symmetric and shared by the bot and dashboard. There is no automatic expiry for the
previous secret — remove it manually when the window closes.

1. Generate a new secret: `openssl rand -hex 32`.
2. On **both** sides set `BOT_API_HMAC_SECRET_PREVIOUS` to the old secret and
   `BOT_API_HMAC_SECRET` to the new one (Vercel env + redeploy; VPS `.env` + `up -d`).
3. Run the smoke test: it uses the new secret and should pass immediately.
4. After ~10 minutes, remove `BOT_API_HMAC_SECRET_PREVIOUS` from both and redeploy/restart.
5. Rotate the Discord bot token separately: reset it in the developer portal, update
   `apps/bot/.env`, restart, and confirm `/readyz` returns 200. A token reset invalidates the old
   token immediately, so do this in one step.

If `AUTH_SECRET` is rotated, all dashboard sessions are invalidated and users must sign in again.

---

## 8. Backup and restore

```bash
# Backup (direct URL, custom format, 14-day retention)
DIRECT_URL='postgresql://...' ./scripts/backup-db.sh

# Restore into a scratch database first — this overwrites data
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname='postgresql://...' backups/nujum-<timestamp>.dump
```

`backups/` is git-ignored. Store copies off-host (object storage with versioning/lock). Prefer
Neon point-in-time restore for incident recovery; the logical dump covers accidental schema or data
changes that PITR would faithfully replay. Before a real restore: stop the bot and Vercel deploys,
restore to a scratch DB, verify row counts and `_prisma_migrations`, then cut over and run the smoke
test. Rehearse this quarterly.

---

## 9. Rollback

- **App regression:** redeploy the previous commit (`git checkout <sha>` in `/opt/nujum` and
  `docker compose up -d --build`; Vercel → Deployments → Promote). No schema change is implied.
- **Bad config:** use the dashboard **Audit** page revert, which writes the inverse values and emits
  a config notification in the same transaction, so the bot hot-reloads.
- **Bad migration:** Prisma migrations are forward-only. Restore from backup/PITR, or write a new
  forward migration; never edit an applied migration file.
- **HMAC mismatch:** restore the last known-good shared secret on both sides, then rerun the smoke
  test. Queued actions remain valid and drain after the API is reachable again.

---

## 10. Ongoing operations

- Keep `.env.compose`, `apps/bot/.env` and Vercel env vars in sync; the only intentionally shared
  value is `BOT_API_HMAC_SECRET` (+ previous during rotation).
- Monitor `/healthz` (liveness) and `/readyz` (readiness) plus `docker compose logs`, audit volume,
  queue depth and unresolved `ThreatEvent` rows on the dashboard.
- Watch disk usage for Caddy certificates (`caddy_data`) and local dumps; rotate logs (Compose caps
  them at 10 MB × 5).
- Apply OS/Docker patches weekly; review the [security checklist](../SECURITY.md) quarterly.
- Keep Oracle security list and `ufw` rules minimal; re-check that 8080 is never published.

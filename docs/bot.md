# Nujum bot — runtime, config watcher and internal API

The bot is a standalone Node process: discord.js v14 for the gateway, Fastify 5 for an internal
HTTP API, Prisma for PostgreSQL and pino for structured logs. It is deployed as a Docker image on
the Oracle Cloud VPS behind Caddy. It never imports the dashboard.

```
apps/bot/
├─ Dockerfile                 # multi-stage, multi-arch, non-root runtime
├─ docker/entrypoint.sh       # fail-fast env check, single/sharded switch
├─ src/
│  ├─ index.ts                # single-process entry point
│  ├─ shard.ts                # ShardingManager entry point (BOT_MODE=sharded)
│  ├─ api/                    # Fastify server, HMAC guard, live actions, queue drain
│  ├─ config/                 # zod env contract + LISTEN/NOTIFY watcher
│  ├─ client/                 # NujumClient + command/event auto-loading
│  ├─ commands/               # utility, configuration, tickets and community commands
│  ├─ core/                   # process guards + graceful shutdown
│  ├─ events/                 # ready, interactionCreate, guild*, error, warn, shard*
│  ├─ handlers/               # command execution, component/modal routing
│  ├─ lib/                    # logger, errors, components, cooldowns, permissions…
│  └─ scripts/                # deploy-commands
└─ .env.example               # full environment contract
```

## What this phase guarantees

| Area        | Behaviour                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Boot        | Env is parsed with zod **before** anything else. Missing/malformed values abort with the variable name, never the value.                                    |
| Intents     | Only the nine intents needed by planned features (Guilds, GuildMembers, GuildModeration, GuildMessages, MessageContent, …).                                 |
| Mentions    | `allowedMentions: { parse: [], repliedUser: false }` globally; user input is sanitized before it can reach a message.                                       |
| Commands    | Auto-loaded from `dist`/`src`, bound to the shared 34-command registry, scope-aware (`guild`/`dm`/`both`), per-user/guild/global rate limits and cooldowns. |
| Components  | Custom ids are namespaced (`nujum:module:action:g<guild>:<user>[:args]`), length-checked, parsed strictly and ownership-checked.                            |
| Permissions | User **and** bot permissions are re-checked at execution time; role hierarchy is enforced for member-targeting commands.                                    |
| Errors      | Every command/event/route catches, logs with a request id and replies with a generic message. Stack traces never reach users.                               |
| Logging     | pino JSON in production, pretty in development, redaction for tokens/secrets/cookies, shard and request ids on every line.                                  |
| API         | `/healthz` + `/readyz` unauthenticated; everything under `/v1` requires HMAC-SHA256 + nonce + timestamp + optional IP allowlist.                            |
| Shutdown    | SIGTERM/SIGINT drain the API, destroy the gateway and disconnect Prisma with a 15s hard deadline; `dumb-init` forwards signals.                             |

## Commands in this phase

| Command    | Scope | What it does                                                               |
| ---------- | ----- | -------------------------------------------------------------------------- |
| `/ping`    | both  | Gateway + round-trip latency with a colour-coded status.                   |
| `/botinfo` | both  | Version, uptime, guild/user counts, shard, memory, Node/discord.js.        |
| `/help`    | both  | Paginated command browser with a per-user refresh button.                  |
| `/invite`  | both  | Bot invite URL using the exact non-Administrator permission bitfield.      |
| `/support` | both  | Support server and documentation links.                                    |
| `/ticket`  | guild | Ticket stats, close/claim, participant, rename, priority, note, blacklist. |
| `/panel`   | guild | Publish or preview the stored ticket panel.                                |
| `/jtc`     | guild | Join-to-Create presets, room controls, interface panel and stats.          |

Register them after a build:

```bash
pnpm --filter @nujum/bot deploy:commands        # global (DEV_GUILD_ID unset)
DEV_GUILD_ID=123456789012345678 pnpm --filter @nujum/bot deploy:commands   # instant, dev guild
```

`deploy:commands` loads the same command modules the bot loads, so the registered payload and the
runtime manifest cannot drift.

## Environment

Copy `apps/bot/.env.example` to `apps/bot/.env`. Required:

| Variable              | Notes                                                                 |
| --------------------- | --------------------------------------------------------------------- |
| `DISCORD_TOKEN`       | Bot token; minimum length and character set are validated.            |
| `DISCORD_CLIENT_ID`   | Application id (snowflake).                                           |
| `DATABASE_URL`        | Pooled PostgreSQL URL used by Prisma at runtime.                      |
| `BOT_API_HMAC_SECRET` | 32+ random bytes (`openssl rand -hex 32`). Shared with the dashboard. |

Common optional values: `DIRECT_URL` (migrations), `DEV_GUILD_ID`, `OWNER_IDS` (CSV), `LOG_LEVEL`,
`LOG_PRETTY`, `BOT_API_HOST`/`BOT_API_PORT`, `BOT_API_TRUST_PROXY`, `BOT_API_IP_ALLOWLIST` (CSV
CIDRs), `BOT_API_HMAC_SECRET_PREVIOUS`, `SHARD_COUNT`, `SHARD_IDS`, `BOT_STATUS`, `BOT_ACTIVITY`,
`SUPPORT_SERVER_URL`, `INVITE_PERMISSIONS`.

Validation rules worth knowing:

- `OWNER_IDS` / `SHARD_IDS` / `BOT_API_IP_ALLOWLIST` accept comma-separated values with spaces.
- Every shard id must be `< SHARD_COUNT`; shard ids are only needed for manual sharding.
- `BOT_API_IP_ALLOWLIST` entries must be valid IPv4/IPv6 CIDRs; empty means “any IP with a valid
  signature”.
- `LOG_PRETTY` defaults to pretty only outside production; never enable it in Docker.

## Internal API

| Route                                          | Auth | Purpose                                                                                  |
| ---------------------------------------------- | ---- | ---------------------------------------------------------------------------------------- |
| `/healthz`                                     | none | Liveness: status, version, uptime, timestamp. No secrets, no DB I/O.                     |
| `/readyz`                                      | none | Readiness: 200 only when PostgreSQL answers **and** the gateway is ready; 503 otherwise. |
| `/v1/meta`                                     | HMAC | `MetaDTO`: version, shards, ping, uptime, guild/user counts, queue depth.                |
| `/v1/guilds/:guildId`                          | HMAC | Channel/role snapshot with live Discord permissions.                                     |
| `POST /v1/guilds/:guildId/messages`            | HMAC | Send a message; `allowedMentions.parse` is always empty.                                 |
| `POST /v1/guilds/:guildId/announcements`       | HMAC | `@everyone` announcement; requires explicit confirmation and bot permission.             |
| `POST /v1/guilds/:guildId/panels/verification` | HMAC | Publish the verification panel to a re-checked channel.                                  |
| `POST /v1/guilds/:guildId/panels/tickets`      | HMAC | Publish or refresh a ticket panel; safe to queue while the bot is offline.               |
| `POST /v1/guilds/:guildId/lockdown`            | HMAC | Apply/clear lockdown with stored overwrites.                                             |
| `POST /v1/queue/drain`                         | HMAC | Claim and drain pending dashboard actions with `FOR UPDATE SKIP LOCKED`.                 |

Every `/v1` request is verified in this order: auth-failure rate limit → IP allowlist → HMAC
signature + timestamp + nonce → authenticated rate limit. Errors are a stable envelope:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Invalid request signature.", "requestId": "…" } }
```

Codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`, `RATE_LIMITED`, `CONFLICT`,
`GUILD_NOT_FOUND`, `BOT_OFFLINE`, `UPSTREAM_ERROR`, `INTERNAL`. Mutations additionally require a
valid snowflake in `x-nujum-actor` and re-check guild membership, channel type and bot permissions
before touching Discord. Rate rules: `authenticated` 120/60s, `authFailure` 10/60s, `mutation`
30/60s, `queueDrain` 4/60s.
Responses carry `cache-control: no-store`, `nosniff`, `DENY`, `no-referrer` and HSTS. CORS is
intentionally not enabled: only the dashboard server calls this API.

### Signing a request (manual test)

```bash
node - <<'NODE'
const { createHmac, randomUUID, createHash } = require('node:crypto');
const secret = process.env.BOT_API_HMAC_SECRET;
const method = 'GET';
const path = '/v1/meta';
const body = '';
const ts = Date.now().toString();
const nonce = randomUUID();
const canonical = [ts, nonce, method, path, createHash('sha256').update(body).digest('hex')].join('\n');
const signature = createHmac('sha256', secret).update(canonical).digest('hex');
console.log({ 'x-nujum-key-id': 'dashboard', 'x-nujum-timestamp': ts, 'x-nujum-nonce': nonce, 'x-nujum-signature': signature });
NODE
```

Send those headers to `https://api.<domain>/v1/meta`. Replaying the same nonce returns 401; a
timestamp older than 60 seconds returns 401; an unsigned request returns 401.

## Config hot-reload

`ConfigWatcher` holds a dedicated `pg` client connected to `DIRECT_URL ?? DATABASE_URL` (a pooled
URL cannot hold `LISTEN`). A validated `nujum_config` notification is treated as a **signal only**:
the bot compares the payload version with the cached version and re-reads configuration from
PostgreSQL, so stale or out-of-order notifications cannot roll settings back. A 10-second poll
fallback covers missed notifications, and a failed `LISTEN` logs a warning without blocking gateway
startup. On reload the `client.security`, `client.verification`, `client.modules`, `client.tickets`
and `client.jtc` caches are cleared; no restart is required.

The payload shape and write helper live in `@nujum/shared/config`; writes happen inside the
caller's Prisma transaction using bound parameters.

## Offline action queue

When the dashboard cannot reach the bot it stores a zod-validated `PendingBotAction` (never code)
and shows a "queued" state. On `ready` the bot calls `DatabaseQueueService.drain()`: rows are claimed
with `FOR UPDATE SKIP LOCKED`, revalidated against current zod contracts, checked against Discord
state again, and marked `SENT`/`FAILED` with an error and attempt count. A 404 on the target
message/channel is treated as idempotent success. The dashboard can also request a drain via
`POST /v1/queue/drain` and cancel entries that are still `PENDING`.

## Tickets and Join-to-Create

The ticket module uses the `TicketConfig`/`TicketCategory`/`TicketPanel` rows as the authoritative
panel definition and the `Ticket`/`TicketParticipant` rows as the live case state. A panel button or
select carries only a namespaced category id; the gateway handler re-checks the module toggle,
config, blacklist, per-user open limit, category, channel permissions and role hierarchy **before**
creating a Discord channel. Ticket numbers come from `Guild.ticketCounter` with a unique
`(guildId, number)` constraint, so concurrent openings cannot collide. Closing a ticket stores a
size-bounded transcript, writes audit metadata, and deletes/locks the channel; unknown channels are
treated as idempotent success when a queued close is drained.

Join-to-Create uses `JtcConfig.generatorChannelId` as the trigger. Joining it creates one channel per
member from `nameTemplate` (`{username}` is replaced with a sanitized display name), applies the
configured limit/bitrate/region plus trusted-role overwrites, stores a `JtcRoom`, and moves the
member. A short per-user/per-guard cooldown prevents reconnect loops from creating duplicates. When
the last member leaves, the channel is deleted and the room is soft-deleted; manual Discord channel
deletions mark the room as deleted too. Room controls (`lock`, `hide`, `limit`, `rename`, `transfer`,
`kick`, `ban`, `permit`, `invite`) require ownership or a trusted role and are re-checked against
Discord at execution time.

Both features hot-reload from the same `nujum_config` notification path as security and verification.
The dashboard can publish ticket panels through `POST /v1/guilds/:guildId/panels/tickets`; when the
bot is offline the action is queued as `PUBLISH_TICKET_PANEL` and revalidated on drain.

## Local development

```bash
pnpm install
cp apps/bot/.env.example apps/bot/.env    # fill in token, client id, HMAC secret
pnpm build:shared
pnpm --filter @nujum/bot dev              # tsx watch, pretty logs
```

- `pnpm --filter @nujum/bot typecheck | lint | test`
- `pnpm --filter @nujum/bot build && pnpm --filter @nujum/bot start`
- `SHARD_COUNT>1` requires a compiled build: `pnpm --filter @nujum/bot start:sharded`.

The bot now reads configuration and writes audit rows through Prisma. `/readyz` performs a
lightweight `SELECT 1`, so credentials or network problems are caught before commands execute. If
`LISTEN/NOTIFY` is unavailable, the watcher keeps working through the 10-second poll fallback.

## Docker deployment (Oracle Cloud VPS)

See [deployment.md](deployment.md) for the full VPS/Vercel runbook, smoke test and rollback steps.

```bash
cp .env.compose.example .env.compose       # BOT_API_DOMAIN + ACME_EMAIL
cp apps/bot/.env.example apps/bot/.env     # real secrets
docker compose --env-file .env.compose up -d --build
```

What the stack does:

- **bot** builds `apps/bot/Dockerfile`, runs as the unprivileged `node` user with a read-only root
  filesystem, no Linux capabilities, `no-new-privileges`, and a 30s stop grace period.
- **caddy** is the only service with published ports (80/443). It obtains a certificate for
  `BOT_API_DOMAIN`, forwards to `bot:8080`, and health-checks `/healthz`.
- The bot sees `BOT_API_TRUST_PROXY=true`, so the client IP used for the allowlist and rate limits
  comes from Caddy's `X-Forwarded-For`. This is safe only because port 8080 is not published.
- Health checks: `docker compose ps`, `docker inspect --format '{{json .State.Health}}' nujum-bot-1`.

Multi-arch: the Dockerfile uses `node:22-bookworm-slim` and has no architecture-specific layers, so
`docker buildx build --platform linux/amd64,linux/arm64` works for Oracle Ampere (arm64) and
standard shapes. Pin the base image by digest in a hardened production setup.

Migrations are a deploy step, not a container start-up step:

```bash
DIRECT_URL=... DATABASE_URL=... pnpm db:deploy
```

Oracle Cloud: allow inbound TCP 80/443 in the VCN security list **and** the instance firewall
(`ufw`/`iptables`), keep 22 restricted, and never expose 8080.

### Logs and operations

- `docker compose logs -f bot` — JSON lines with `shard`, `requestId`, `guildId` where relevant.
- Token, cookie, authorization and HMAC values are redacted by the logger configuration.
- The process exits non-zero on uncaught exceptions after a clean shutdown, so Docker restarts it.
- `/readyz` returning 503 means the database or gateway is down; `/healthz` stays 200 while the
  process is alive (useful for liveness probes that should not flap on a Discord outage).

## Tests (112 bot tests + 89 shared tests)

| File                      | Covers                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `config/env.test.ts`      | defaults, CSV parsing, missing token, weak secret, bad CIDRs/shard ids.                                                       |
| `lib/ip.test.ts`          | IPv4/IPv6 parsing, IPv4-mapped addresses, CIDR masking, allowlist.                                                            |
| `lib/components.test.ts`  | custom id round-trip, length/namespace/tamper rejection, ownership.                                                           |
| `lib/cooldowns.test.ts`   | cooldown expiry, per-user/guild/global rate-limit isolation.                                                                  |
| `lib/loader.test.ts`      | recursive loading, support-file skipping, loud failure on bad exports.                                                        |
| `lib/permissions.test.ts` | full shared→discord.js permission mapping, no missing flags.                                                                  |
| `commands.test.ts`        | manifest parity with the shared registry, valid Discord JSON, invite URL never requests Administrator.                        |
| `api/server.test.ts`      | health/readiness, unsigned/replayed/wrong-path requests, malformed JSON, 404, IP allowlist, all live routes and actor checks. |
| `api/queue.test.ts`       | queued payload revalidation, drain cases and idempotent handling.                                                             |
| `config/watcher.test.ts`  | version comparison, stale notifications, poll fallback, DB failure isolation.                                                 |
| `tickets/tickets.test.ts` | ticket config cache/degradation, naming format, byte-accurate transcript escaping.                                            |
| `jtc/jtc.test.ts`         | JTC name sanitization, validation and preset/room guards.                                                                     |

Run everything:

```bash
pnpm typecheck && pnpm test && pnpm lint && pnpm build
```

## Dashboard smoke test

With a real database, a Discord OAuth app and matching `BOT_API_HMAC_SECRET` in both apps:

1. Sign in at `/login` and open a server you own or manage.
2. Change a security setting and save. The audit log shows a before/after diff; the bot reloads the
   config in seconds with no restart.
3. Stop the bot container and send a message from **Live actions**. The UI reports `QUEUED` and the
   **Queue** page lists the entry.
4. Restart the bot. The queue drains automatically; the entry disappears and Discord shows the
   message.
5. Publish the verification panel and toggle lockdown the same way; both are permission-checked at
   execution time.

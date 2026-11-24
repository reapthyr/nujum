# Nujum

> **نجوم** — "stars". An all-in-one Discord bot and a separate, premium admin dashboard.

Nujum is a production-grade monorepo with two independently deployable apps that share one
PostgreSQL database and one contracts package:

- **`apps/bot`** — discord.js v14 bot + small Fastify API, hosted on an Oracle Cloud VPS in Docker
  behind Caddy (automatic HTTPS). _(Phase 2+)_
- **`apps/dashboard`** — Next.js 15 admin dashboard on Vercel. _(Phase 5+)_
- **`packages/shared`** — Prisma schema/client, zod contracts, DTOs, constants, permission
  definitions and the HMAC implementation.

> **Phase 1 status:** workspace, shared package, database schema, first migration and 78 unit tests
> are complete. The bot and dashboard apps arrive in later phases.

---

## Architecture

```mermaid
flowchart LR
  DU[Discord users] -->|Gateway / REST| DC[Discord API]

  subgraph V["Vercel — serverless"]
    W["apps/dashboard<br/>Next.js 15 · RSC · Server Actions"]
    AU["Auth.js v5<br/>Discord OAuth (identify + guilds)"]
    W --- AU
  end

  subgraph O["Oracle Cloud VPS — Docker"]
    CA["Caddy<br/>api.domain → :8080<br/>auto HTTPS"]
    B["apps/bot<br/>discord.js v14 + Fastify"]
    CA --> B
  end

  DB[("PostgreSQL — Neon<br/>single source of truth")]
  Q[["pg_notify('nujum_config')<br/>LISTEN + 10s poll fallback"]]

  W -->|"Prisma · pooled URL"| DB
  W -->|"HMAC-SHA256 + nonce + ts<br/>zod · rate limited"| CA
  B -->|"Prisma · pooled URL<br/>(direct URL for migrations)"| DB
  B <-->|"Gateway + REST"| DC
  AU -->|"OAuth2"| DC
  DB -.-> Q -.-> B

  W -. "bot offline → config saved,<br/>actions queued" .-> DB
```

### Why this shape

- Vercel cannot reach a database on the VPS, so **hosted PostgreSQL is authoritative**.
- Config flows **dashboard → DB → `NOTIFY` → bot cache invalidation**, so the bot never exposes a
  public config endpoint and settings keep working while the bot is offline.
- Only **live Discord reads/actions** cross the HMAC-authenticated Bot API boundary (channels,
  roles, members, publishing panels, sending messages, lockdown).
- The two apps never import each other; only `@nujum/shared` is shared.

### Data flows

1. **Settings change** — dashboard server action validates with zod → authorizes the user →
   upserts config in a transaction → bumps `Guild.configVersion` → `pg_notify` → writes `AuditLog`.
   The bot receives the payload, invalidates its per-guild cache and hot-reloads.
2. **Live action** — dashboard signs the request (HMAC, timestamp, single-use nonce) → Caddy →
   Fastify verifies signature, replay window and rate limit → performs the Discord action.
3. **Bot offline** — dashboard still writes config and inserts a `PendingBotAction`; the UI shows an
   offline badge and “queued” state. The bot drains the queue when it reconnects.

---

## Repository layout

```
nujum/
├─ apps/
│  ├─ bot/                    # Phase 2+ (discord.js, Fastify, Docker, Caddy)
│  └─ dashboard/              # Phase 5+ (Next.js 15 on Vercel)
├─ packages/shared/
│  ├─ prisma/
│  │  ├─ schema.prisma        # 66 models, single source of truth
│  │  └─ migrations/20261124000000_init/
│  └─ src/
│     ├─ constants.ts         # brand, enums mirrored for client safety, limits
│     ├─ modules.ts           # 21 module definitions + dashboard paths
│     ├─ permissions.ts       # 34 commands with user/bot permissions & cooldowns
│     ├─ zod/                 # contracts for every config, action and API route
│     ├─ hmac.ts              # canonical request, sign, verify, nonce cache
│     ├─ rate-limit.ts        # token buckets + multi-rule limiter
│     ├─ env.ts               # env validation + NEXT_PUBLIC_ secret guard
│     ├─ sanitize.ts          # control-char stripping, mention neutralization
│     ├─ audit-diff.ts        # before/after diff + revert
│     └─ prisma.ts            # serverless-safe Prisma singleton
├─ docs/
│  ├─ database.md
│  └─ (deployment, API and command docs land in later phases)
├─ SECURITY.md
└─ README.md
```

---

## Tech stack

| Layer      | Choice                                                                              |
| ---------- | ----------------------------------------------------------------------------------- |
| Runtime    | Node.js 20+, TypeScript strict (`noUncheckedIndexedAccess`)                         |
| Bot        | discord.js v14, Fastify 5, Prisma 6, zod, pino                                      |
| Dashboard  | Next.js 15 (App Router), React 19, Tailwind v4, shadcn/ui, TanStack Query, Recharts |
| Auth       | Auth.js v5, Discord OAuth2 (`identify guilds`), database sessions                   |
| Database   | PostgreSQL (Neon or Supabase), pooled runtime URL + direct migration URL            |
| Queue      | PostgreSQL (`ScheduledAction`, `PendingBotAction`), `FOR UPDATE SKIP LOCKED`        |
| Config bus | `LISTEN/NOTIFY` + 10s polling fallback                                              |
| Hosting    | Oracle Cloud VPS (Docker, Caddy, arm64/amd64) + Vercel                              |

---

## Quickstart

Prerequisites: **Node ≥ 20.11**, **pnpm ≥ 9**, a PostgreSQL 15+ database (Neon recommended).

```bash
pnpm install
cp packages/shared/.env.example packages/shared/.env   # fill DATABASE_URL / DIRECT_URL
pnpm db:deploy          # apply the generated migration (or `pnpm db:migrate` in dev)
pnpm build:shared
pnpm typecheck
pnpm test
pnpm lint
```

Useful scripts:

| Command                         | Purpose                                       |
| ------------------------------- | --------------------------------------------- |
| `pnpm build:shared`             | `prisma generate` + compile shared to `dist/` |
| `pnpm db:generate`              | regenerate the Prisma client                  |
| `pnpm db:migrate`               | create/apply a dev migration                  |
| `pnpm db:deploy`                | apply committed migrations (CI/production)    |
| `pnpm db:studio`                | Prisma Studio                                 |
| `pnpm test` / `pnpm test:watch` | Vitest                                        |
| `pnpm format`                   | Prettier                                      |

> Apps are added in later phases; `pnpm dev` appears once the bot exists.

### Environment

`packages/shared/.env.example` documents the database and HMAC variables shared by both
deployables. Each app gets its own `.env.example` when it is created:

- **Bot:** Discord token/client ID, guild ID for dev commands, API bind/port, HMAC secret, IP
  allowlist, log level.
- **Dashboard:** Auth.js secret/URL, Discord OAuth credentials, database URLs, bot API base URL +
  HMAC secret, owner IDs, Upstash (optional).

---

## Shared package

| Import                     | Environment     | Contents                                                                                |
| -------------------------- | --------------- | --------------------------------------------------------------------------------------- |
| `@nujum/shared`            | client + server | constants, modules, permissions, types, zod schemas, sanitize, rate limiter, audit diff |
| `@nujum/shared/zod`        | client + server | all request/config contracts                                                            |
| `@nujum/shared/prisma`     | server only     | Prisma client singleton, `Prisma` namespace                                             |
| `@nujum/shared/hmac`       | server only     | sign/verify, nonce cache                                                                |
| `@nujum/shared/env`        | server only     | env parsing, `NEXT_PUBLIC_` guard                                                       |
| `@nujum/shared/rate-limit` | client + server | token buckets                                                                           |

The root entry point intentionally avoids `node:crypto` and Prisma so client components can import
schemas without bundling server code. A parity test keeps every mirrored enum in sync with the
generated Prisma client.

### HMAC contract

```
canonical = `${timestamp}\n${nonce}\n${METHOD}\n${sortedPath}\n${sha256hex(body)}`
signature = hex(HMAC_SHA256(secret, canonical))

headers: x-nujum-key-id, x-nujum-timestamp, x-nujum-nonce, x-nujum-signature
window: 60s · nonce single-use for 5 min · previous secret accepted during rotation
```

Implemented and tested: tampering, wrong method, expired timestamp, replay, malformed headers,
unknown key id and secret rotation.

---

## Database

The schema contains 66 models covering guilds, auth, audit, security, moderation, tickets,
join-to-create, welcome/verification, role panels, logging, leveling and community modules. See
[`docs/database.md`](docs/database.md) for pooling, migrations, NOTIFY and retention.

Highlights:

- Guild-scoped config is **1:1 with `Guild`** (`guildId @id`) so a settings save is one upsert.
- Gap-free per-guild numbering for cases and tickets via counters incremented in the same
  transaction as the insert.
- `ScheduledAction` is the restart-safe scheduler queue; `PendingBotAction` is the offline action
  queue.
- `AuditLog` stores before/after JSON for every dashboard and bot change, with revert metadata.
- Every relation to `Guild` cascades on delete; a 30-day purge job will use `Guild.leftAt`.

---

## Security

Phase 1 delivers the foundations:

- No hardcoded secrets; `parseEnv` crashes with variable names only (never values).
- `assertNoPublicSecrets` fails the dashboard build if a secret uses `NEXT_PUBLIC_`.
- zod validation + sanitization primitives for every input surface.
- HMAC request signing with timing-safe comparison, replay protection and rotation.
- Token-bucket rate limiting (per user / per guild / global) with multi-rule enforcement.
- Enum parity test prevents schema drift between app code and the database.

See [SECURITY.md](SECURITY.md) for the full model and phase-by-phase controls.

---

## Phase plan

| Phase | Scope                                                           | Status      |
| ----- | --------------------------------------------------------------- | ----------- |
| 1     | Monorepo, shared package, Prisma schema, migration, tests       | ✅ complete |
| 2     | Bot foundation: client, handlers, commands, Docker              | next        |
| 3     | Bot security layer: permissions, hierarchy, anti-raid/nuke/spam |             |
| 4     | Bot API + HMAC + dashboard client                               |             |
| 5     | Dashboard auth, layout, landing                                 |             |
| 6–13  | Tickets, JTC, help, moderation, logging, welcome, pages, extras |             |
| 14    | Deployment docs, CI/CD, Playwright E2E                          |             |

---

## License

Proprietary — all rights reserved. See `SECURITY.md` for vulnerability reporting.

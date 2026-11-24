# Database

Nujum uses a single PostgreSQL database as the source of truth for both deployables.

- **Runtime** (bot + Vercel functions): pooled connection string.
- **Migrations / Studio**: direct (non-pooled) connection string.
- **Config hot-reload**: PostgreSQL `LISTEN/NOTIFY` with a 10-second polling fallback.

Schema: [`packages/shared/prisma/schema.prisma`](../packages/shared/prisma/schema.prisma)

---

## 1. Provisioning (Neon)

1. Create a project at [neon.tech](https://neon.tech) in the region closest to your VPS
   (e.g. `eu-central-1` for an Oracle Frankfurt instance).
2. Copy both connection strings from **Dashboard → Connection details**:
   - **Pooled** — host contains `-pooler`.
   - **Direct** — used only by migrations.
3. Append the serverless parameters to the pooled URL:

```
postgresql://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/nujum?sslmode=require&pgbouncer=true&connection_limit=1&connect_timeout=15&pool_timeout=20
```

`connection_limit=1` is required on Vercel: each function instance keeps one connection and Neon's
PgBouncer multiplexes them. The bot can use a slightly higher limit (e.g. `connection_limit=5`) but
the same pooled host.

4. Set the same `DATABASE_URL` (pooled) and `DIRECT_URL` (direct) in:
   - `packages/shared/.env` for local Prisma commands,
   - Vercel → Project → Environment Variables,
   - the VPS `.env` file used by docker-compose.

Supabase works identically: use the pooler host (`*.pooler.supabase.com:6543`) for `DATABASE_URL`
and port `5432` for `DIRECT_URL`.

---

## 2. Migrations

The initial migration is committed at:

```
packages/shared/prisma/migrations/20261124000000_init/migration.sql
```

Commands (run from the repo root):

```bash
pnpm db:migrate     # development: create + apply a migration (needs DIRECT_URL)
pnpm db:deploy      # CI/production: apply committed migrations only
pnpm db:generate    # regenerate the client after schema edits
pnpm db:studio      # browse data
```

Rules:

- **Never** run `prisma migrate` from the Vercel runtime. Use CI (`.github/workflows/db-migrate.yml`,
  added in Phase 14) or run it manually against `DIRECT_URL`.
- Schema changes are reviewed as SQL in the migration file, not only as a Prisma diff.
- Migrations are forward-only; destructive changes require an explicit backup step.
- The Prisma client is generated into `packages/shared/generated/client` and is git-ignored;
  `postinstall` regenerates it for every install.

### Generating a migration without a live database

```bash
cd packages/shared
DATABASE_URL="postgresql://user:pass@localhost:5432/nujum" \
  pnpm exec prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script \
  --output prisma/migrations/<timestamp>_<name>/migration.sql
```

---

## 3. Config hot-reload (LISTEN/NOTIFY)

Every config mutation bumps `Guild.configVersion` and emits a notification **inside the same
transaction** as the data write:

```sql
SELECT pg_notify('nujum_config', $1); -- $1 = JSON payload
```

Payload (validated with zod on the bot):

```json
{
  "guildId": "123456789012345678",
  "version": 42,
  "source": "DASHBOARD",
  "action": "security.config.update",
  "changedBy": "987654321098765432",
  "at": "2026-11-24T12:00:00.000Z"
}
```

Bot behavior:

1. A dedicated `pg` client (not Prisma) holds `LISTEN nujum_config`.
2. On payload: compare `version` with the cached version; reload only when newer.
3. Every 10 seconds, poll `Guild.configVersion` for guilds the bot is in as a fallback.
4. Cached configs also expire after 30 seconds (`CONFIG_CACHE_TTL_MS`).
5. On reconnect or startup, all guilds are loaded and stale entries discarded.

The notification payload is a _signal_, never the config itself. The bot always re-reads from the
database, so a lost or duplicated notification is harmless.

---

## 4. Transactions and counters

- Case numbers: `UPDATE "Guild" SET "caseCounter" = "caseCounter" + 1 ... RETURNING` inside the same
  transaction as the `ModCase` insert, unique on `(guildId, caseNumber)`.
- Ticket numbers: same pattern with `ticketCounter` and unique `(guildId, number)`.
- Config writes, `configVersion` bump, notification and audit entry share one transaction.
- Prisma parameterized queries only. Raw SQL is limited to `pg_notify` and
  `FOR UPDATE SKIP LOCKED` queue claims, both with bound parameters.

---

## 5. Queues

| Table              | Purpose                                                          | Claim strategy                                                     |
| ------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `ScheduledAction`  | temp bans/mutes/roles, reminders, giveaway/poll ends, auto-close | `FOR UPDATE SKIP LOCKED`, `status = PENDING`, `executeAt <= now()` |
| `PendingBotAction` | dashboard actions queued while the bot is offline                | `status = PENDING`, drained on reconnect or `/queue/drain`         |

Both are idempotent at the handler level (Discord 404/unknown-member is treated as success) so
at-least-once delivery is safe.

---

## 6. Retention

Planned defaults (implemented with the scheduler in Phase 13):

| Data                | Retention                        |
| ------------------- | -------------------------------- |
| `GuildStatSnapshot` | 90 days (daily rollup beyond)    |
| `AuditLog`          | 365 days                         |
| `ThreatEvent`       | 180 days                         |
| `TicketTranscript`  | 90 days (configurable per guild) |
| `ModCase`           | indefinite, soft-revoked only    |
| `BotStatus`         | 7 days                           |

Guilds removed from Discord are soft-deleted (`Guild.leftAt`) and purged after 30 days with a full
cascade.

---

## 7. Backups

- Neon: enable point-in-time restore (default 7 days, extend on paid plans).
- Weekly logical dump via `scripts/backup-db.sh` (Phase 14) using `pg_dump --format=custom`.
- Per-guild config backups are also stored in `Backup` and exportable from the dashboard.
- Restore drills are part of the Phase 14 security checklist.

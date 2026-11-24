# Security policy

Nujum handles moderation authority, private ticket channels and configuration for other people's
servers. Security is a first-class feature, not a phase.

## Reporting a vulnerability

Email **security@nujum.app** with reproduction steps and impact. Do not open a public issue for
anything that could be exploited. We aim to acknowledge within 72 hours.

---

## Principles

1. **Least privilege** — minimum gateway intents and Discord permissions, documented per feature.
2. **Server-side authorization** — the dashboard never trusts client checks; every page, action and
   API route re-verifies session, guild membership and `Manage Guild`/`Administrator`.
3. **Defense in depth** — HMAC + nonce + timestamp + rate limit + IP allowlist (optional) + zod.
4. **Fail closed** — missing env vars crash at startup with variable names only.
5. **No secret leakage** — no stack traces or tokens to Discord; no secrets in API responses; no
   `NEXT_PUBLIC_` secrets (build-time guard).
6. **Auditability** — every config change and moderation action records actor, before/after, reason
   and timestamp, and is revertible.
7. **Parameterized data access** — Prisma only; raw SQL limited to `pg_notify` and queue claims with
   bound parameters.

---

## Implemented in Phase 1 (shared package)

| Control                                                               | Location                |
| --------------------------------------------------------------------- | ----------------------- |
| Strict env parsing, value-free errors                                 | `src/env.ts`            |
| `NEXT_PUBLIC_` secret guard                                           | `assertNoPublicSecrets` |
| HMAC-SHA256 canonical signing                                         | `src/hmac.ts`           |
| 60s timestamp window, single-use nonce (5 min TTL, bounded cache)     | `src/hmac.ts`           |
| Timing-safe signature comparison                                      | `src/hmac.ts`           |
| Secret rotation (previous secret accepted)                            | `verifyRequest`         |
| Input sanitization (control/zero-width chars, mention neutralization) | `src/sanitize.ts`       |
| zod contracts for every config domain and Bot API route               | `src/zod/`              |
| Embed/message limits (title, description, fields, 10 embeds)          | `src/zod/common.ts`     |
| Token-bucket limiter (per user / guild / global)                      | `src/rate-limit.ts`     |
| Audit before/after diff + revert builder                              | `src/audit-diff.ts`     |
| Enum parity with the database                                         | `src/enums.test.ts`     |
| Serverless-safe Prisma singleton                                      | `src/prisma.ts`         |

Tests: 78 unit tests cover HMAC tampering/replay/expiry/rotation, env failures, rate limits,
permission checks, diff/revert and schema validation.

---

## Implemented in Phase 2 (bot foundation)

| Control                                                                                         | Location                                    |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Explicit zod env contract; failures name variables, never values                                | `apps/bot/src/config/env.ts`                |
| Nine required intents only; privileged intents documented in `.env.example`                     | `apps/bot/src/client/NujumClient.ts`        |
| Global `unhandledRejection` / `uncaughtException` guards + graceful shutdown                    | `apps/bot/src/core/`                        |
| Per-command user/guild/global rate limits and cooldowns                                         | `apps/bot/src/lib/cooldowns.ts`             |
| Permission + bot-permission re-checks and role hierarchy at execution                           | `apps/bot/src/lib/permissions.ts`           |
| Namespaced component ids with user/guild ownership checks                                       | `apps/bot/src/lib/components.ts`            |
| Global `allowedMentions { parse: [] }`; sanitized user input                                    | `apps/bot/src/client/NujumClient.ts`        |
| Ephemeral, generic user errors; full errors only in structured logs                             | `apps/bot/src/lib/errors.ts`                |
| pino redaction of tokens, cookies, HMAC headers and database URLs                               | `apps/bot/src/lib/logger.ts`                |
| HMAC-SHA256 + timestamp + single-use nonce on `/v1/*`, optional CIDR allowlist, per-IP limits   | `apps/bot/src/api/`                         |
| `/healthz` + `/readyz` with no secrets; 503 when DB/gateway is down                             | `apps/bot/src/api/server.ts`                |
| Container: non-root, read-only rootfs, no capabilities, `no-new-privileges`, Caddy-only ingress | `apps/bot/Dockerfile`, `docker-compose.yml` |

Tests: 54 bot tests cover env failures, CIDR/IP parsing, custom-id tampering and ownership,
cooldowns/rate limits, loader safety, permission mapping, command-manifest parity and the API
(health, HMAC success/replay/wrong-path, malformed JSON, 404, IP allowlist).

---

## Controls by phase

### Phase 3 — bot security layer (implemented)

- Re-check command permissions and role hierarchy in code; never rely on Discord's UI defaults,
  never target the owner, self, the bot or equal/higher roles.
- Anti-raid: mass-join detection with account-age signal, configurable punishment or auto-lockdown
  that stores and restores previous channel overwrites.
- Anti-nuke: audit-log-attributed channel/role deletion, bans/kicks and webhook creation; dangerous
  roles stripped or actor banned, owner alerted, trusted-user allowlist honored, staff not exempt.
- Permission-escalation alerts when a role gains `Administrator`, with containment of clear
  self-escalation by a non-owner.
- Scam/phishing domain and typosquat detection; invite/link/mention/spam/flood filters with
  configurable punishments and per-guild alert throttling.
- Verification codes are DM-only, hashed with a salt, timing-safe, owner-bound on submission, and
  limited to three attempts with a ten-minute expiry.
- Namespaced component IDs with guild/user binding and permission re-checks.
- Cached, zod-validated configuration with safe defaults when PostgreSQL is unavailable; every
  change written to `AuditLog`, every threat to `ThreatEvent`.
- 82 bot tests cover detectors, configuration caching/failover, thresholds, exemptions, code
  hashing, alert throttling, lockdown restore/retry and command-manifest parity. See
  [docs/security.md](docs/security.md).

### Phase 4 — Bot API, config bus and dashboard (implemented)

- HMAC on every `/v1` route, optional CIDR allowlist, strict per-route rate limits (120/60s
  authenticated, 10/60s auth failures, 30/60s mutations, 4/60s queue drains).
- zod validation on params, query, body and every queued payload; no wildcard CORS; no secrets in
  responses; request IDs and structured error envelopes.
- Mutations require a valid snowflake actor id and re-check guild membership, channel type and bot
  permissions immediately before acting. Mentions stay neutralized (`parse: []`).
- Config writes happen in one transaction with the version bump, `pg_notify` and audit entry. The bot
  treats notifications as signals, compares versions and re-reads from the database; polling covers
  missed notifications and a failed `LISTEN` cannot block gateway startup.
- Offline actions are stored as validated data, revalidated on drain and claimed with
  `FOR UPDATE SKIP LOCKED`; 404s are idempotent successes.

### Phase 5 — dashboard security (implemented)

- Auth.js v5 Discord OAuth with exactly `identify guilds`, database sessions, httpOnly/secure/sameSite
  cookies, 8h lifetime, 15m rolling updates and a Discord blacklist check on sign-in and every
  request.
- `requireGuildAccess` re-verifies session, Discord guild membership and owner / `Administrator` /
  `Manage Guild` / `DASHBOARD_OWNER_IDS` on every page and server action; the `Guild` row is upserted
  so foreign keys stay valid.
- Origin guard on mutations (against `NEXT_PUBLIC_APP_URL` / `AUTH_URL`) plus per-operation rate
  limits; OAuth tokens and HMAC secrets never cross to client components.
- HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy and Permissions-Policy via
  `next.config.ts`; source maps disabled in production.
- Sensitive actions require a Discord identity check within `REAUTH_WINDOW_MINUTES` (default 15);
  a completed OAuth flow refreshes the stamp for all of that user's sessions.
- Full audit log with before/after diff, actor metadata and one-transaction revert for config changes;
  errors returned to the browser are generic and never contain stack traces or database details.

### Phase 14 — operations

- SSH keys only, password login disabled, non-root user, `ufw`, `fail2ban`,
  `unattended-upgrades`.
- Ports opened in both the Oracle security list and the OS firewall.
- Caddy automatic HTTPS; bot API bound to localhost/Compose network only.
- Secrets in Vercel/GitHub Actions/Oracle vaults; never committed.
- Log rotation, healthchecks, uptime monitoring, restore drills.

---

## Secret handling checklist

- [x] No secrets in the repository (`.env*` ignored except `.env.example`).
- [x] Startup validation rejects missing/weak secrets.
- [x] HMAC secret ≥ 32 chars; rotation supported.
- [x] Build fails on `NEXT_PUBLIC_*TOKEN|SECRET|DATABASE_URL|...`.
- [ ] Dashboard → bot requests signed and replay-protected (Phase 4).
- [ ] Database credentials restricted to pooled/direct roles (Phase 14).
- [ ] GitHub Actions uses environment-scoped secrets (Phase 14).
- [x] Logs redact tokens, HMAC headers and connection strings (Phase 2).

---

## Threat model summary

| Threat                                | Mitigation                                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Stolen dashboard session              | DB sessions revocable, 8h expiry, 15m rotation, re-auth for destructive actions                 |
| CSRF                                  | SameSite cookies, origin checks, Auth.js CSRF, signed mutations                                 |
| Replayed Bot API request              | 60s window + single-use nonce cache + HMAC                                                      |
| Compromised VPS                       | Bot token and HMAC secret scoped to the VPS; DB role limited; no dashboard secrets stored there |
| Rogue moderator                       | Hierarchy checks, audit log, anti-nuke, trusted allowlist, escalation alerts                    |
| Raid                                  | Join-rate detection, account-age gate, lockdown, alerting                                       |
| Malicious user input                  | zod + sanitization + mention neutralization + embed limits                                      |
| Prisma/DB injection                   | Parameterized queries only; JSON validated on read                                              |
| Secret exfiltration via client bundle | Server-only env module + build guard + subpath exports                                          |

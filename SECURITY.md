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

## Planned controls by phase

### Phase 2 — bot foundation

- Gateway intents: `Guilds`, `GuildMembers` (privileged), `GuildModeration`, `GuildMessages`,
  `MessageContent` (privileged), `GuildMessageReactions`, `GuildVoiceStates`, `GuildInvites`,
  `DirectMessages`. Each documented with a reason; features degrade gracefully without privileged
  intents.
- Global `unhandledRejection` / `uncaughtException` handlers; graceful shutdown.
- Ephemeral, friendly user errors; full errors only in structured logs.

### Phase 3 — bot security layer

- Re-check command permissions in code (never rely on Discord's UI defaults).
- Role hierarchy: cannot target the owner, self, the bot, or equal/higher roles.
- Anti-raid: mass-join detection, account-age gate, auto-lockdown.
- Anti-nuke: mass channel/role deletion, bans/kicks, webhook creation; revert where possible,
  strip permissions, alert owner, trusted-user allowlist.
- Permission-escalation alerts when `@everyone` or a role gains `Administrator`.
- Scam/phishing domain list; invite/link/mention/spam/flood filters with configurable punishments.
- Namespaced component IDs with guild/user/ticket binding and permission re-checks.

### Phase 4 — Bot API

- HMAC on every route, optional CIDR allowlist, strict per-route rate limits.
- zod validation on params, query and body; no wildcard CORS; no secrets in responses.
- Request IDs and structured error envelopes.

### Phase 5+ — dashboard

- Auth.js v5 database sessions, httpOnly/secure/sameSite cookies, 8h lifetime, 15m rotation.
- Server-side authorization on every request; global owner area gated by `OWNER_IDS`.
- CSRF protection on mutations (Auth.js + origin checks + double-submit for route handlers).
- CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy via `next.config.ts`.
- Upstash rate limiting (in-memory fallback in development).
- Re-authentication for dangerous actions when the session is older than 15 minutes.
- Full audit log with diff view and revert.

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
- [ ] Logs redact tokens, HMAC headers and connection strings (Phase 2/4).

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

# Bot security layer (Phase 3)

This document describes the protections that run **inside the bot process**. Dashboard-side
security and the internal Bot API are covered in [SECURITY.md](../SECURITY.md) and
[bot.md](bot.md).

The guiding rule: **Discord UI checks are never trusted**. Every action re-checks permissions,
hierarchy, guild ownership and in-memory configuration immediately before acting.

---

## Required gateway intents and Discord permissions

Intents are unchanged from Phase 2 (`Guilds`, `GuildMembers`, `GuildModeration`, `GuildMessages`,
`MessageContent`, `GuildMessageReactions`, `GuildVoiceStates`, `GuildInvites`, `DirectMessages`).
`GuildMembers` and `MessageContent` are privileged and must be enabled in the developer portal.

For the security module to take live action the bot needs, in addition to `ViewChannel`,
`SendMessages`, `EmbedLinks`, `ReadMessageHistory`:

| Permission                                       | Used for                                                       |
| ------------------------------------------------ | -------------------------------------------------------------- |
| `ManageChannels`                                 | Lockdown overwrites and channel-delete detection               |
| `ManageRoles`                                    | Verification role, escalation containment, lockdown overwrites |
| `BanMembers` / `KickMembers` / `ModerateMembers` | Raid and nuke punishments                                      |
| `ViewAuditLog`                                   | Identifying who deleted/banned/kicked/created a webhook        |

`/invite` derives its permission bitfield from the shared command registry, so the install URL
always includes these. It never requests `Administrator`.

---

## Protections

### Anti-spam / content filters

`messageCreate` runs a single classifier with a fixed priority order:

1. **Phishing** — known scam hosts, Discord/Steam typosquats, punycode lookalikes, and shorteners
   paired with scam wording. Severity 3.
2. **Invites** — `discord.gg/<code>` and `discord.com/invite/<code>` unless the code is in
   `allowedInviteCodes` or the whitelist. Severity 1.
3. **Links** — only enforced when `allowedDomains` is non-empty (an empty list would otherwise
   delete every link). Official Discord hosts and whitelisted domains/subdomains pass. Severity 1.
4. **Mention floods** — message mentions above `mentionLimit`. Severity 2.
5. **Duplicate floods** — the same normalized text 3 times in `spamWindowSeconds`. Severity 2.
6. **Rate spam** — `spamThreshold` messages in `spamWindowSeconds`. Severity 2.

Punishment comes from `spamAction` (`DELETE` for invites/links). Staff, guild owner, bot, global
owners and whitelisted users/roles/channels are exempt from spam actions. Every triggered rule is
written to `ThreatEvent` and `AuditLog`; the alert is rate-limited per guild/user.

### Anti-raid

`guildMemberAdd` records each join in a bounded sliding window (`raidJoinThreshold` joins per
`raidWindowSeconds`). Accounts younger than `raidMinAccountAgeDays` are tracked as a signal but
are **never punished individually** — action happens only when the join rate crosses the threshold.

- `raidAction = LOCKDOWN` → deny send permissions in every manageable text/voice channel (when
  `autoLockdown` is on). `@everyone` and any role/member overwrite that explicitly allows a locked
  permission are denied, so a role-specific allow cannot bypass the lockdown. Every replaced
  overwrite is stored in `LockdownState` and restored exactly by
  `/security lockdown action:lift` or the alert's **Lift lockdown** button; failed restores remain
  in the snapshot so a second press can retry.
- Other punishments are applied only to the young accounts in the burst, and only if the member is
  not exempt and Discord's hierarchy checks allow it.

### Anti-nuke

Destructive events (`channelDelete`, `roleDelete`, `guildBanAdd`, `guildMemberRemove` for kicks,
`webhooksUpdate`) are correlated with the Discord audit log. An actor is only identified when a
recent (15s) entry targets the deleted/banned entity; entries produced by the bot itself are
ignored. When `nukeThreshold` actions of the same type occur inside `nukeWindowSeconds`:

1. The guild owner, bot and whitelist are exempt; **staff are not** — a compromised moderator is
   exactly the threat model.
2. The actor is banned if possible, otherwise dangerous roles are stripped.
3. The guild is locked down when `autoLockdown` is enabled.
4. A severity-3 threat, audit entry and owner alert are written.

Channels cannot be restored by Discord's API, so the response contains and alerts rather than
pretending to undo destruction.

### Permission escalation

`roleUpdate` compares permission bitfields; `roleCreate` checks new Administrator roles. An audit
entry identifies the executor. Newly granted Administrator by a non-owner results in dangerous
roles being removed from the actor, plus a threat record and alert. Routine permission additions
by staff produce an alert only.

### Module toggles and failure modes

- `SECURITY` and `VERIFICATION` flags come from `GuildModule` with the shared registry defaults
  (`SECURITY` on, `VERIFICATION` off). Toggles are cached for 30s and invalidated on change.
- Configuration is cached for 30s per guild with shared in-flight loads. If PostgreSQL is down,
  the bot uses safe built-in defaults (`antiRaidEnabled`, `antiNukeEnabled`, `antiSpamEnabled`,
  `phishingDetection`, `autoLockdown` all on) and retries quickly. Events never crash on a DB
  error.
- All state is per-process. Shards detect raids independently; cross-shard coordination would need
  a shared store and is deliberately out of scope.

---

## Verification module

`/security verification action:setup channel:#... role:@... mode:BUTTON|CAPTCHA|ACCOUNT_AGE min_age:7`

posts a panel with a guild-bound **Verify** button. The route re-checks the guild, the role and the
bot's `ManageRoles` permission/hierarchy before granting anything.

- **BUTTON** — account age is checked, the session is marked verified and the role is assigned.
- **CAPTCHA** — a 6-digit code is generated, stored only as `salt:sha256(salt:code)` and DM'd to the
  member; an owner-bound modal accepts it with at most 3 attempts and a 10-minute expiry. Codes use
  a timing-safe comparison.
- **ACCOUNT_AGE** — the same check as BUTTON, with the configured minimum age as the gate.

Sessions are unique per `(guildId, userId)`. Completion is written to `AuditLog`. `"FAILED"` is a
local session state only; the database stores it as `EXPIRED`.

---

## Commands and components

| Command                                            | Notes                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| `/security status`                                 | Ephemeral summary of protections, lockdown and verification.        |
| `/security toggle <protection> <enabled>`          | `raid`, `nuke`, `spam`, `invites`, `links`, `phishing`, `lockdown`. |
| `/security lockdown <activate\|lift> [reason]`     | Restores or stores overwrites; always audited.                      |
| `/security whitelist <add\|remove> <type> <value>` | zod + snowflake validation; audited.                                |
| `/security verification <setup\|disable\|info>`    | Panel setup, disable or read-only info.                             |

The lockdown alert button is **guild-bound, not owner-bound**, so a moderator can lift a lockdown
even if the owner is offline. It re-checks the caller's `ManageGuild` permission in code. Verification
buttons are guild-bound for the same reason; the CAPTCHA modal is owner-bound. Every component id
still carries a namespaced `nujum:<module>:<action>:g<guild>:<user>` signature and is parsed strictly.

---

## Tests

```powershell
pnpm build:shared
pnpm --filter @nujum/bot test     # 82 bot tests (28 new security tests)
```

The new tests cover sliding windows, raid thresholds and young-account detection, per-action nuke
correlation, escalation bitfields, phishing/link/invite parsing, spam classification, exemptions,
alert throttling, verification code hashing, configuration caching/failover/deduplication, module
defaults, lockdown overwrite restore/retry and audit-actor predicates. Network calls and real
Discord objects are never required.

### Manual verification in a test guild

1. `/security status` → values match the dashboard/database.
2. `/security toggle phishing false` → phishing links no longer removed; toggle back on.
3. Post `https://discord-nitro.com/claim` → message removed, severity-3 alert, `ThreatEvent` row.
4. Post `discord.gg/someinvite` → removed; add the code with `/security whitelist add INVITE someinvite`
   → allowed. Verify both changes in `AuditLog`.
5. Send 8 short messages in 5 seconds → timeout after the configured threshold.
6. Have a throwaway account join repeatedly inside 30 seconds → lockdown alert appears, channels
   deny `SendMessages` for `@everyone` and roles with an explicit allow; press **Lift lockdown** →
   previous overwrites restored exactly (a failed restore can be retried by pressing again).
7. Delete 3 channels with a staff account → actor loses dangerous roles, guild locks, severity-3
   alert. Confirm the bot's own channel deletions do **not** trigger it.
8. Give a role `Administrator` → alert and containment; confirm an ordinary permission change does
   not trigger containment.
9. `/security verification action:setup ... mode:CAPTCHA` → press the panel button, receive the DM
   code, submit it, receive the role. Try a wrong code 3 times → no role and an expired session.
10. Confirm the bot continues serving commands with `DATABASE_URL` temporarily unreachable (safe
    defaults apply and warnings are logged).

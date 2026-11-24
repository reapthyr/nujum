# Tickets and Join-to-Create (Phase 6)

This guide covers the ticket and Join-to-Create (JTC) modules shared by the bot and dashboard. Both
features use PostgreSQL as the source of truth and Discord only for the live channel state. Neither
deployable imports the other.

---

## Tickets

### Configuration

The dashboard **Tickets** page writes `TicketConfig` and `TicketCategory` rows through zod-validated
server actions. Every save is one transaction that writes the config, bumps `Guild.configVersion`,
emits `pg_notify('nujum_config')`, and stores a before/after `AuditLog` entry. Reverting the audit
entry restores the stored before-image through the same path, so the bot hot-reloads the revert
without a restart.

`TicketConfig` controls:

- module/channel routing (`panelChannelId`, `transcriptChannelId`, `logChannelId`);
- support roles and the per-user open limit;
- inactivity/warning windows and the channel `namingFormat` (must contain `{number}`);
- optional 1–5 star rating.

Each `TicketCategory` can override the support roles and target Discord category, and can define up
to ten form fields. Form field keys must be unique. A panel may reference at most 25 categories.

### Panel publishing

Panels are stored as `TicketPanel` rows with a JSON embed and a `BUTTONS` or `DROPDOWN` layout. They
can be published/refreshed from:

- `/panel publish` or `/panel preview` in Discord;
- the dashboard **Tickets** page, which calls `POST /v1/guilds/:guildId/panels/tickets`.

The dashboard action is HMAC-signed. If the bot is offline, the dashboard stores a
`PUBLISH_TICKET_PANEL` entry in `PendingBotAction`; it is revalidated against current zod contracts,
module/config state and Discord permissions when drained.

Panel buttons and selects only carry a namespaced category id. The bot re-checks ownership, guild,
module toggle, blacklist, open limit, category, channel permissions and role hierarchy before it
creates a ticket channel.

### Ticket lifecycle

1. Opening increments `Guild.ticketCounter` atomically and creates a channel named by
   `namingFormat`. The unique `(guildId, number)` constraint prevents collisions.
2. The opener and configured support roles receive channel overwrites; the bot keeps
   `ViewChannel`, `SendMessages` and `ReadMessageHistory`.
3. `Ticket` and `TicketParticipant` rows are inserted. If the database insert fails, the Discord
   channel is deleted so no orphan remains.
4. `/ticket` and the panel controls support claim, close, add/remove participant, rename, transfer,
   priority, note, staff call, stats and blacklist. Staff actions require `ManageChannels` or a
   configured support role and pass hierarchy checks; the opener can close their own ticket.
5. Closing writes a size-bounded `TicketTranscript`, optionally posts it to the transcript channel,
   sets `CLOSED`/`closedAt`, writes audit metadata, and removes/locks the channel.

---

## Join-to-Create

`JtcConfig` is written from the dashboard **Join-to-Create** page with the same audited,
hot-reloading transaction pattern. It defines the generator voice channel, target category, room
naming template, default user limit/bitrate/region, interface/panel channels and trusted roles.

When a member joins the generator channel:

1. The bot checks the JTC module toggle, config and a short per-user cooldown.
2. It creates a voice channel from `nameTemplate` (`{username}` is replaced with a sanitized display
   name), applies the configured limit/bitrate/region and trusted-role overwrites, and stores a
   `JtcRoom`.
3. It moves the member into the new room. A failure at any step is logged and rolled back where
   possible; reconnect loops cannot create duplicate rooms.

When the last member leaves, or when the Discord channel is deleted manually, the room is removed
from Discord and `JtcRoom.deletedAt` is set. `/jtc` lets a room owner (or trusted role) manage presets,
lock/unlock, hide/unhide, rename, set limit/bitrate/region, transfer ownership, invite, kick, ban and
permit members. Room controls are re-checked against live Discord state on every use.

---

## Security controls

- Slash commands are bound to the shared permission registry; registration cannot drift from
  runtime checks.
- User and bot permissions plus role hierarchy are re-checked at execution time.
- Component custom ids are namespaced, guild-bound and owner-bound unless the component is a shared
  panel control; shared controls still enforce guild and permission checks.
- All bot messages use `allowedMentions: { parse: [], repliedUser: false }`.
- Config writes use parameterized Prisma queries and zod validation; no executable code is ever
  stored in `PendingBotAction`.
- Every mutation writes an audit entry. Dashboard config changes are revertible from the audit log.

---

## End-to-end test

Prerequisites: `pnpm install`, `pnpm db:deploy`, a running bot with matching `BOT_API_HMAC_SECRET`,
and a signed-in dashboard session.

1. Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm format:check`.
2. Deploy commands:
   `pnpm --filter @nujum/bot deploy:commands` (or set `DEV_GUILD_ID` for instant registration).
3. In the dashboard, enable **Tickets** and **Join-to-Create** in **Modules**, then save each module's
   config page. Confirm the audit log shows before/after diffs and the bot logs a config reload
   without restarting.
4. Create one or two ticket categories, then publish the panel from `/panel publish` and from the
   dashboard button. Confirm both updates the stored panel message id.
5. Click a panel button and open a ticket. Confirm the channel number increments, overwrites are
   correct, and the `Ticket`/`TicketParticipant` rows appear. Open a second ticket as another user
   and confirm independent numbering.
6. Claim, add/remove, rename, set priority, note, call staff, then close the ticket. Confirm the
   transcript row, audit entries and channel removal/lock. Revert a config change in the dashboard
   and confirm the bot picks it up without restart.
7. Blacklist a user and confirm they cannot open another ticket; remove the blacklist and confirm
   they can.
8. Configure a JTC generator channel, join it in voice, and confirm a named room is created and the
   member is moved. Change preset/limit/bitrate and transfer ownership, then have the last member
   leave; confirm the channel and `JtcRoom` are cleaned up.
9. Stop the bot, publish a ticket panel from the dashboard, and confirm the UI reports `QUEUED` and
   the queue page lists `PUBLISH_TICKET_PANEL`. Restart the bot, drain the queue, and confirm the
   panel is published and the entry is marked `SENT`.

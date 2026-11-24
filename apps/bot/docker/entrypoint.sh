#!/bin/sh
# Entrypoint for the Nujum bot container.
#
# - Fails fast with the *name* of a missing variable (never its value).
# - Defaults to a single process; set BOT_MODE=sharded to run the ShardingManager.
# - Execs the CMD so dumb-init forwards SIGTERM/SIGINT to Node for graceful shutdown.
set -eu

: "${DISCORD_TOKEN:?DISCORD_TOKEN is required}"
: "${DISCORD_CLIENT_ID:?DISCORD_CLIENT_ID is required}"
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BOT_API_HMAC_SECRET:?BOT_API_HMAC_SECRET is required}"

if [ "${BOT_MODE:-single}" = "sharded" ]; then
  set -- node dist/shard.js
fi

exec "$@"

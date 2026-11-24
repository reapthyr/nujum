import { COMPONENT_NAMESPACE, MAX_CUSTOM_ID_LENGTH } from "../config/constants";
import { BotError, ERROR_CODES } from "./errors";

/**
 * Component custom ids are namespaced and bound to the guild and user that
 * created them, so a button from guild A can never be pressed by a member of
 * guild B (or by another user in the same guild).
 *
 * Shape: `nujum:<module>:<action>:<g|d guildId>:<userId>[:arg...]`
 */

const TOKEN_PATTERN = /^[a-z0-9_-]{1,32}$/i;
const SNOWFLAKE_PATTERN = /^\d{16,20}$/;

export interface CustomIdInput {
  module: string;
  action: string;
  guildId: string | null;
  userId: string;
  args?: readonly (string | number)[];
}

export interface ParsedCustomId {
  namespace: string;
  module: string;
  action: string;
  guildId: string | null;
  userId: string;
  args: string[];
  raw: string;
}

export interface CustomIdOwner {
  userId: string;
  guildId: string | null;
}

function assertToken(value: string, label: string): string {
  if (!TOKEN_PATTERN.test(value)) {
    throw new BotError(ERROR_CODES.internal, "Invalid component identifier.", {
      meta: { label, value },
    });
  }
  return value.toLowerCase();
}

export function buildCustomId(input: CustomIdInput): string {
  if (!SNOWFLAKE_PATTERN.test(input.userId)) {
    throw new BotError(ERROR_CODES.internal, "Invalid component owner.", {
      meta: { label: "userId" },
    });
  }
  if (input.guildId !== null && !SNOWFLAKE_PATTERN.test(input.guildId)) {
    throw new BotError(ERROR_CODES.internal, "Invalid component guild.", {
      meta: { label: "guildId" },
    });
  }

  const scope = input.guildId === null ? "d" : `g${input.guildId}`;
  const segments = [
    COMPONENT_NAMESPACE,
    assertToken(input.module, "module"),
    assertToken(input.action, "action"),
    scope,
    input.userId,
    ...(input.args ?? []).map((arg) => encodeURIComponent(String(arg))),
  ];

  const customId = segments.join(":");
  if (customId.length > MAX_CUSTOM_ID_LENGTH) {
    throw new BotError(ERROR_CODES.internal, "Component identifier is too long.", {
      meta: { length: customId.length },
    });
  }
  return customId;
}

export function parseCustomId(raw: string): ParsedCustomId | null {
  if (raw.length === 0 || raw.length > MAX_CUSTOM_ID_LENGTH) return null;
  const segments = raw.split(":");
  if (segments.length < 5) return null;

  const [namespace, module, action, scope, userId, ...encodedArgs] = segments;
  if (
    namespace !== COMPONENT_NAMESPACE ||
    module === undefined ||
    action === undefined ||
    scope === undefined ||
    userId === undefined ||
    !TOKEN_PATTERN.test(module) ||
    !TOKEN_PATTERN.test(action) ||
    !SNOWFLAKE_PATTERN.test(userId)
  ) {
    return null;
  }

  let guildId: string | null;
  if (scope === "d") {
    guildId = null;
  } else if (scope.startsWith("g") && SNOWFLAKE_PATTERN.test(scope.slice(1))) {
    guildId = scope.slice(1);
  } else {
    return null;
  }

  const args: string[] = [];
  for (const encoded of encodedArgs) {
    try {
      args.push(decodeURIComponent(encoded));
    } catch {
      return null;
    }
  }

  return {
    namespace,
    module: module.toLowerCase(),
    action: action.toLowerCase(),
    guildId,
    userId,
    args,
    raw,
  };
}

/** A press is valid only for the same user, in the same guild (or the same DM). */
export function isCustomIdOwner(parsed: ParsedCustomId, owner: CustomIdOwner): boolean {
  return parsed.userId === owner.userId && parsed.guildId === owner.guildId;
}

export function matchesRoute(
  parsed: ParsedCustomId,
  route: { module: string; action: string },
): boolean {
  return (
    parsed.module === route.module.toLowerCase() && parsed.action === route.action.toLowerCase()
  );
}

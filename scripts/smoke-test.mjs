#!/usr/bin/env node
/**
 * Repeatable post-deploy smoke test for Nujum.
 *
 * Usage:
 *   BOT_API_URL=https://api.example.com \
 *   BOT_API_HMAC_SECRET=<same secret as the bot> \
 *   [DASHBOARD_URL=https://dashboard.example.com] \
 *   node scripts/smoke-test.mjs
 *
 * Exit codes: 0 = all checks passed, 1 = a check failed, 2 = bad configuration.
 *
 * The signing code mirrors `canonicalRequest`/`signRequest` in @nujum/shared so
 * this script also runs on a fresh VPS before `pnpm build` has produced dist/.
 * It never prints the secret or any signed header.
 */

import { createHash, createHmac, randomBytes } from "node:crypto";

const API_URL = (process.env.BOT_API_URL ?? "").replace(/\/+$/, "");
const SECRET = process.env.BOT_API_HMAC_SECRET ?? "";
const DASHBOARD_URL = (process.env.DASHBOARD_URL ?? "").replace(/\/+$/, "");
const TIMEOUT_MS = 10_000;

let passed = 0;
let failed = 0;

function report(name, ok, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${suffix}`);
}

function sign(method, path) {
  const timestamp = Date.now();
  const nonce = randomBytes(16).toString("hex");
  const bodyHash = createHash("sha256").update("").digest("hex");
  const canonical = [String(timestamp), nonce, method.toUpperCase(), path, bodyHash].join("\n");
  return {
    "x-nujum-key-id": "dashboard",
    "x-nujum-timestamp": String(timestamp),
    "x-nujum-nonce": nonce,
    "x-nujum-signature": createHmac("sha256", SECRET).update(canonical).digest("hex"),
  };
}

async function request(base, path, headers = {}) {
  const response = await fetch(`${base}${path}`, {
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: response.status, json, text };
}

if (!/^https?:\/\//.test(API_URL)) {
  console.error("BOT_API_URL must be an http(s) origin, e.g. https://api.example.com");
  process.exit(2);
}
if (SECRET.length < 32) {
  console.error("BOT_API_HMAC_SECRET must be at least 32 characters (openssl rand -hex 32).");
  process.exit(2);
}

console.log(`Nujum smoke test → ${API_URL}`);

try {
  const health = await request(API_URL, "/healthz");
  report(
    "GET /healthz",
    health.status === 200 && health.json?.status === "ok",
    `status ${health.status}${health.json?.version ? `, version ${health.json.version}` : ""}`,
  );
} catch (error) {
  report("GET /healthz", false, error instanceof Error ? error.message : String(error));
}

try {
  const ready = await request(API_URL, "/readyz");
  const ok = ready.status === 200 && ready.json?.database === true && ready.json?.gateway === true;
  report(
    "GET /readyz (database + Discord gateway)",
    ok,
    `status ${ready.status}, database=${String(ready.json?.database)}, gateway=${String(ready.json?.gateway)}`,
  );
} catch (error) {
  report("GET /readyz", false, error instanceof Error ? error.message : String(error));
}

try {
  const unsigned = await request(API_URL, "/v1/meta");
  const protectedResponse = unsigned.status === 401 || unsigned.status === 403;
  report(
    "GET /v1/meta without signature is rejected",
    protectedResponse,
    `status ${unsigned.status}${unsigned.status === 403 ? " (IP allowlist)" : ""}`,
  );
} catch (error) {
  report("GET /v1/meta unsigned", false, error instanceof Error ? error.message : String(error));
}

try {
  const tamperedHeaders = sign("GET", "/v1/meta");
  tamperedHeaders["x-nujum-signature"] = "0".repeat(64);
  const tampered = await request(API_URL, "/v1/meta", tamperedHeaders);
  report(
    "GET /v1/meta with bad signature is rejected",
    tampered.status === 401,
    `status ${tampered.status}`,
  );
} catch (error) {
  report(
    "GET /v1/meta bad signature",
    false,
    error instanceof Error ? error.message : String(error),
  );
}

try {
  const authenticated = await request(API_URL, "/v1/meta", sign("GET", "/v1/meta"));
  const data = authenticated.json?.data;
  const ok = authenticated.status === 200 && data?.apiVersion === "v1";
  report(
    "GET /v1/meta with valid signature (Caddy → HMAC → bot)",
    ok,
    ok
      ? `guilds=${String(data.guildCount)}, ping=${String(data.pingMs)}ms, queue=${String(data.queueDepth)}`
      : `status ${authenticated.status}`,
  );
} catch (error) {
  report("GET /v1/meta signed", false, error instanceof Error ? error.message : String(error));
}

if (DASHBOARD_URL) {
  try {
    const dashboard = await request(DASHBOARD_URL, "/");
    const ok = dashboard.status === 200 || dashboard.status === 307 || dashboard.status === 308;
    report("GET / on the dashboard", ok, `status ${dashboard.status}`);
  } catch (error) {
    report("GET / on the dashboard", false, error instanceof Error ? error.message : String(error));
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;

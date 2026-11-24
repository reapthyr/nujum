import { TICKET_DEFAULTS } from "@nujum/shared";

export interface TranscriptMessage {
  authorTag: string;
  content: string;
  createdAt: Date;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Produces a small, self-contained HTML transcript. Content is escaped and the
 * result is capped at the shared byte budget so a noisy ticket cannot fill the
 * database or Discord attachment limits.
 */
export function buildTranscriptHtml(
  messages: readonly TranscriptMessage[],
  maxBytes: number = TICKET_DEFAULTS.transcriptMaxBytes,
): { html: string; sizeBytes: number; messageCount: number } {
  const head =
    '<!doctype html><html><head><meta charset="utf-8"><title>Ticket transcript</title>' +
    "<style>body{font-family:sans-serif;background:#0d1226;color:#e8e8f0;padding:24px}" +
    ".msg{margin:0 0 12px}.who{color:#a78bfa;font-weight:600}.time{color:#94a3b8;font-size:12px}</style>" +
    "</head><body><h1>Ticket transcript</h1>";
  const tail = "</body></html>";
  const overhead = Buffer.byteLength(head + tail, "utf8");
  if (overhead > maxBytes) {
    const minimal = Buffer.from(head + tail, "utf8")
      .subarray(0, maxBytes)
      .toString("utf8");
    return { html: minimal, sizeBytes: Buffer.byteLength(minimal, "utf8"), messageCount: 0 };
  }
  let body = "";
  let used = overhead;
  let count = 0;

  for (const message of messages) {
    const line =
      `<div class="msg"><span class="who">${escapeHtml(message.authorTag)}</span> ` +
      `<span class="time">${escapeHtml(message.createdAt.toISOString())}</span>` +
      `<div>${escapeHtml(message.content.slice(0, 2000))}</div></div>`;
    const bytes = Buffer.byteLength(line, "utf8");
    if (used + bytes > maxBytes) break;
    body += line;
    used += bytes;
    count += 1;
  }

  const html = `${head}${body}${tail}`;
  return {
    html,
    sizeBytes: used,
    messageCount: count,
  };
}

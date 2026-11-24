/** Removes mentions, markdown control characters and line breaks from a display name. */
export function sanitizeVoiceName(value: string): string {
  return value
    .replace(/[\r\n@`#<>]/g, "")
    .replace(/[*_~|\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
}

/** Renders the configured JTC name template; `{username}` is always replaced. */
export function renderJtcName(template: string, displayName: string): string {
  const name = template.split("{username}").join(sanitizeVoiceName(displayName) || "Member");
  return name.replace(/[\r\n@`#<>]/g, "").slice(0, 80) || "Room";
}

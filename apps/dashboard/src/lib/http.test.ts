import { describe, expect, it } from "vitest";
import { isAllowedOrigin, SecurityError, toActionResult } from "./http";

describe("request guards", () => {
  it("allows only exact configured origins", () => {
    const allowed = ["https://dashboard.example.com", "https://admin.example.com"];
    expect(isAllowedOrigin("https://dashboard.example.com", allowed)).toBe(true);
    expect(isAllowedOrigin("https://dashboard.example.com.evil.test", allowed)).toBe(false);
    expect(isAllowedOrigin("http://dashboard.example.com", allowed)).toBe(false);
    expect(isAllowedOrigin(null, allowed)).toBe(false);
    expect(isAllowedOrigin("not-a-url", allowed)).toBe(false);
  });

  it("returns structured, non-leaking action errors", () => {
    expect(toActionResult(new SecurityError("Denied.", "FORBIDDEN"))).toEqual({
      ok: false,
      error: "Denied.",
      code: "FORBIDDEN",
    });
    const result = toActionResult(new Error("database password leaked"));
    expect(result.ok).toBe(false);
    expect("error" in result && result.error).not.toContain("password");
  });
});

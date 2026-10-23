import { describe, expect, it } from "vitest";
import config, { contentSecurityPolicy, securityHeaders } from "../next.config";

describe("web security headers", () => {
  it("applies the headers to every route", async () => {
    const rules = await config.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.source).toBe("/:path*");
    expect(rules[0]!.headers.map((h) => h.key)).toEqual(securityHeaders.map((h) => h.key));
  });
  it("blocks framing, locks sources to this origin and allows no plugins", () => {
    for (const part of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "connect-src 'self'", "base-uri 'self'", "form-action 'self'"]) {
      expect(contentSecurityPolicy).toContain(part);
    }
    expect(contentSecurityPolicy).not.toMatch(/\*|http:|https:/);
  });
  it("only permits geolocation (user-triggered); never camera or microphone", () => {
    const pp = securityHeaders.find((h) => h.key === "Permissions-Policy")!.value;
    expect(pp).toContain("geolocation=(self)");
    expect(pp).toContain("camera=()");
    expect(pp).toContain("microphone=()");
  });
  it("does not advertise the framework", () => {
    expect(config.poweredByHeader).toBe(false);
  });
});

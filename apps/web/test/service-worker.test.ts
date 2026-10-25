import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

describe("PWA Assets and Service Worker Spec Compliance", () => {
  const publicDir = resolve(__dirname, "../public");

  it("provides valid web app manifest.json conforming to PWA installability requirements", () => {
    const manifestPath = resolve(publicDir, "manifest.json");
    expect(existsSync(manifestPath)).toBe(true);

    const content = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(content.name).toContain("COURT IQ");
    expect(content.short_name).toBe("COURT IQ");
    expect(content.start_url).toBe("/");
    expect(content.display).toBe("standalone");
    expect(content.theme_color).toBe("#f97316");
    expect(content.background_color).toBe("#0f172a");
    expect(Array.isArray(content.icons)).toBe(true);
    expect(content.icons.length).toBeGreaterThanOrEqual(3);

    const has192 = content.icons.some((i: { sizes: string }) => i.sizes === "192x192");
    const has512 = content.icons.some((i: { sizes: string }) => i.sizes === "512x512");
    const hasMaskable = content.icons.some((i: { purpose: string }) => i.purpose === "maskable");

    expect(has192).toBe(true);
    expect(has512).toBe(true);
    expect(hasMaskable).toBe(true);
  });

  it("provides offline.html shell fallback", () => {
    const offlinePath = resolve(publicDir, "offline.html");
    expect(existsSync(offlinePath)).toBe(true);

    const html = readFileSync(offlinePath, "utf-8");
    expect(html).toContain("Offline Mode");
    expect(html).toContain("COURT IQ");
    expect(html).toContain("/manifest.json");
  });

  it("provides sw.js service worker with network-first API strategy, cache versioning, and RFC 9457 offline problem details", () => {
    const swPath = resolve(publicDir, "sw.js");
    expect(existsSync(swPath)).toBe(true);

    const swCode = readFileSync(swPath, "utf-8");
    expect(swCode).toContain("courtiq-v1");
    expect(swCode).toContain("addEventListener(\"install\"");
    expect(swCode).toContain("addEventListener(\"activate\"");
    expect(swCode).toContain("addEventListener(\"fetch\"");
    expect(swCode).toContain("application/problem+json");
    expect(swCode).toContain("Device is disconnected");
    expect(swCode).toContain("/offline.html");
  });

  it("provides vector icon assets for all manifest targets", () => {
    expect(existsSync(resolve(publicDir, "icons/icon-192.svg"))).toBe(true);
    expect(existsSync(resolve(publicDir, "icons/icon-512.svg"))).toBe(true);
    expect(existsSync(resolve(publicDir, "icons/icon-maskable.svg"))).toBe(true);
  });
});

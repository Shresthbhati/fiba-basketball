import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { canTransition } from "../src/match/match-state.js";

describe("api baseline", () => {
  it("reports health and echoes a request id", async () => {
    const res = await buildApp().inject({ url: "/health", headers: { "x-request-id": "abc" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "UP" });
    expect(res.headers["x-request-id"]).toBe("abc");
  });

  it("returns problem+json for unknown routes", async () => {
    const res = await buildApp().inject({ url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toContain("application/problem+json");
  });
});

describe("MatchState", () => {
  it("allows only forward transitions", () => {
    expect(canTransition("SCHEDULED", "LIVE")).toBe(true);
    expect(canTransition("FINISHED", "LOCKED")).toBe(true);
    expect(canTransition("SCHEDULED", "FINISHED")).toBe(false);
    expect(canTransition("LOCKED", "LIVE")).toBe(false);
  });
});

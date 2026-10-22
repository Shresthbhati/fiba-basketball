import { describe, expect, it } from "vitest";
import { boundingBox, haversineMeters, roundDistance } from "../src/geo/distance.js";
import { phaseOf } from "../src/pickup/phase.js";

describe("geo", () => {
  it("computes known distances", () => {
    // London -> Paris is ~344 km.
    const d = haversineMeters({ lat: 51.5074, lng: -0.1278 }, { lat: 48.8566, lng: 2.3522 });
    expect(d / 1000).toBeGreaterThan(340);
    expect(d / 1000).toBeLessThan(348);
    expect(haversineMeters({ lat: 1, lng: 1 }, { lat: 1, lng: 1 })).toBe(0);
  });
  it("bounding box contains every point inside the radius", () => {
    const c = { lat: 40.7, lng: -74 };
    const box = boundingBox(c, 5000);
    const p = { lat: c.lat + 4500 / 111_320, lng: c.lng };
    expect(haversineMeters(c, p)).toBeLessThan(5000);
    expect(p.lat).toBeLessThanOrEqual(box.maxLat);
  });
  it("rounds distances to 100 m", () => {
    expect(roundDistance(1249)).toBe(1200);
    expect(roundDistance(1251)).toBe(1300);
  });
});

describe("phaseOf", () => {
  const g = { status: "OPEN" as const, startsAt: new Date("2030-01-01T10:00Z"), endsAt: new Date("2030-01-01T12:00Z"), capacity: 2 };
  it("moves OPEN -> FULL -> IN_PROGRESS -> UNCONFIRMED by time, never COMPLETED", () => {
    expect(phaseOf(g, 1, new Date("2030-01-01T09:00Z"))).toBe("OPEN");
    expect(phaseOf(g, 2, new Date("2030-01-01T09:00Z"))).toBe("FULL");
    expect(phaseOf(g, 2, new Date("2030-01-01T11:00Z"))).toBe("IN_PROGRESS");
    expect(phaseOf(g, 2, new Date("2030-01-02T00:00Z"))).toBe("UNCONFIRMED");
  });
  it("only a stored status completes or cancels", () => {
    expect(phaseOf({ ...g, status: "COMPLETED" }, 2, new Date("2029-01-01T00:00Z"))).toBe("COMPLETED");
    expect(phaseOf({ ...g, status: "CANCELLED" }, 0, new Date("2030-01-01T11:00Z"))).toBe("CANCELLED");
  });
});

import { describe, expect, it } from "vitest";
import { grantRole } from "../src/authz/service.js";
import { testApp, user } from "./helpers.js";

describe("courts", () => {
  it("creates, searches nearby sorted with rounded distances, and filters by radius", async () => {
    const t = await testApp();
    const u = await user(t, "c@example.com");
    const make = (name: string, lat: number, lng: number, indoor = false) =>
      t.app.inject({ method: "POST", url: "/api/v1/courts", headers: { cookie: u.cookie }, payload: { name, lat, lng, indoor } });
    expect((await make("Near", 40.7128, -74.006)).statusCode).toBe(201);
    await make("Mid indoor", 40.74, -74.006, true);
    await make("Far", 41.5, -74.006);

    const res = await t.app.inject({ url: "/api/v1/courts/nearby?lat=40.7128&lng=-74.006&radius_m=5000" });
    const items = res.json().items;
    expect(items.map((c: { name: string }) => c.name)).toEqual(["Near", "Mid indoor"]);
    expect(items[0].distanceM % 100).toBe(0);
    expect(items[0].verificationStatus).toBe("UNVERIFIED");

    const indoor = await t.app.inject({ url: "/api/v1/courts/nearby?lat=40.7128&lng=-74.006&radius_m=5000&indoor=true" });
    expect(indoor.json().items).toHaveLength(1);
  });

  it("caps the radius and validates coordinates", async () => {
    const t = await testApp();
    expect((await t.app.inject({ url: "/api/v1/courts/nearby?lat=1&lng=1&radius_m=60000" })).statusCode).toBe(400);
    expect((await t.app.inject({ url: "/api/v1/courts/nearby?lat=95&lng=1" })).statusCode).toBe(400);
  });

  it("requires sign-in to add a court or report, and a moderator to verify", async () => {
    const t = await testApp();
    const u = await user(t, "v@example.com");
    expect((await t.app.inject({ method: "POST", url: "/api/v1/courts", payload: { name: "x", lat: 1, lng: 1 } })).statusCode).toBe(401);
    const created = await t.app.inject({ method: "POST", url: "/api/v1/courts", headers: { cookie: u.cookie }, payload: { name: "x", lat: 1, lng: 1 } });
    const id = created.json().id;
    const report = await t.app.inject({ method: "POST", url: `/api/v1/courts/${id}/reports`, headers: { cookie: u.cookie }, payload: { kind: "CLOSED" } });
    expect(report.statusCode).toBe(201);
    const verify = () => t.app.inject({ method: "POST", url: `/api/v1/courts/${id}/verification`, headers: { cookie: u.cookie }, payload: { status: "MODERATOR_VERIFIED" } });
    expect((await verify()).statusCode).toBe(403);
    await grantRole(t.db, u.id, "MODERATOR");
    const ok = await verify();
    expect(ok.statusCode).toBe(200);
    expect(ok.json().verificationStatus).toBe("MODERATOR_VERIFIED");
    expect((await t.app.inject({ url: `/api/v1/courts/${id}` })).json().verificationStatus).toBe("MODERATOR_VERIFIED");
  });
});

// @vitest-environment node
// Checks the real API responses contain every field the pickup screens read, so the UI and server cannot drift apart.
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../../services/api/src/app";
import * as schema from "../../../services/api/src/db/schema";

describe("pickup API shape", () => {
  it("returns the fields the web app depends on", async () => {
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../../services/api/drizzle", import.meta.url)) });
    const app = await buildApp(db as never, { secureCookies: false });
    const su = await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: { email: "h@example.com", password: "correct-horse-battery", displayName: "Hana", dateOfBirth: "1990-01-01" } });
    const cookie = String(su.headers["set-cookie"]).split(";")[0]!;
    const court = (await app.inject({ method: "POST", url: "/api/v1/courts", headers: { cookie }, payload: { name: "Rucker", lat: 40.8, lng: -73.9 } })).json();
    const hour = 3_600_000;
    const created = await app.inject({
      method: "POST", url: "/api/v1/pickup", headers: { cookie },
      payload: { courtId: court.id, title: "Run", startsAt: new Date(Date.now() + 2 * hour).toISOString(), endsAt: new Date(Date.now() + 4 * hour).toISOString(), capacity: 4 },
    });
    expect(created.statusCode).toBe(201);

    const detail = (await app.inject({ url: `/api/v1/pickup/${created.json().id}`, headers: { cookie } })).json();
    for (const k of ["id", "title", "courtId", "startsAt", "endsAt", "capacity", "confirmedCount", "spotsLeft", "phase", "hostName", "checkInCount", "waitlistCount", "myStatus", "isHost", "participants"]) {
      expect(detail, k).toHaveProperty(k);
    }
    expect(detail.participants[0]).toHaveProperty("name");

    const list = (await app.inject({ url: "/api/v1/pickup?lat=40.8&lng=-73.9&radius_m=2000" })).json().items[0];
    for (const k of ["id", "title", "startsAt", "confirmedCount", "capacity", "phase", "courtName", "distanceM"]) expect(list, k).toHaveProperty(k);

    const nearby = (await app.inject({ url: "/api/v1/courts/nearby?lat=40.8&lng=-73.9&radius_m=2000" })).json().items[0];
    for (const k of ["id", "name", "indoor", "surface", "hoops", "distanceM", "verificationStatus"]) expect(nearby, k).toHaveProperty(k);
    await app.close();
  }, 60_000);
});

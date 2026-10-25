import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { LocalDiskStorage } from "../src/media/storage.js";
import { MemoryMailer } from "../src/identity/mailer.js";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema.js";
import type { Db } from "../src/db/index.js";
import { user } from "./helpers.js";

async function setup() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  const dir = await mkdtemp(join(tmpdir(), "film-annot-test-"));
  const app = await buildApp(db as unknown as Db, {
    secureCookies: false,
    requireVerifiedGuardianEmail: false,
    mailer: new MemoryMailer(),
    storage: new LocalDiskStorage(dir),
  });
  return { app, db: db as unknown as Db };
}

type T = Awaited<ReturnType<typeof setup>>;
type U = { id: string; cookie: string };
const call = (t: T, u: U, method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
  t.app.inject({
    method,
    url,
    headers: { cookie: u.cookie },
    ...(payload === undefined ? {} : { payload: payload as never }),
  });

async function world(t: T) {
  const coach = await user(t as never, "annot-coach@test.com", { displayName: "Coach Pop" });
  const player = await user(t as never, "annot-player@test.com", { displayName: "Manu Ginobili" });
  const outsider = await user(t as never, "annot-outsider@test.com", { displayName: "Rival Coach" });

  const teamId = (await call(t, coach, "POST", "/api/v1/teams", { name: "Spurs" })).json().id as string;
  await call(t, coach, "POST", `/api/v1/teams/${teamId}/members`, { email: "annot-player@test.com", role: "PLAYER" });

  const gameId = (await call(t, coach, "POST", `/api/v1/teams/${teamId}/games`, {
    title: "vs Suns Game 4",
    opponent: "Suns",
  })).json().id as string;

  const clipId = (await call(t, coach, "POST", `/api/v1/film/games/${gameId}/clips`, {
    startMs: 10000,
    endMs: 25000,
    tags: ["pick-and-roll", "defense"],
    note: "Corner hedge rotation breakdown",
  })).json().id as string;

  return { coach, player, outsider, teamId, gameId, clipId };
}

describe("Game Film Telestrator & Visual Keyframe Annotations (Spec §6.3, §6.8, WP-3.2)", () => {
  it("enforces negative authZ on annotation endpoints for non-team members (ADR-0010)", async () => {
    const t = await setup();
    const w = await world(t);

    // Outsider cannot create annotation (returns 404)
    const createRes = await call(t, w.outsider, "POST", `/api/v1/film/games/${w.gameId}/annotations`, {
      timestampMs: 15000,
      title: "Illegal Screen Detection",
      shapes: [
        {
          id: "shape-1",
          type: "ARROW",
          color: "#ef4444",
          coordinates: { x1: 20, y1: 40, x2: 45, y2: 60 },
        },
      ],
    });
    expect(createRes.statusCode).toBe(404);

    // Outsider cannot list annotations (returns 404)
    const listRes = await call(t, w.outsider, "GET", `/api/v1/film/games/${w.gameId}/annotations`);
    expect(listRes.statusCode).toBe(404);
  });

  it("creates, retrieves, and filters keyframe annotations with drawing shapes", async () => {
    const t = await setup();
    const w = await world(t);

    // Coach creates annotation attached to a clip
    const createRes = await call(t, w.coach, "POST", `/api/v1/film/games/${w.gameId}/annotations`, {
      clipId: w.clipId,
      timestampMs: 14200,
      durationMs: 4000,
      title: "Backdoor Cut & Help Rotation",
      category: "TACTICAL",
      shapes: [
        {
          id: "s1",
          type: "CIRCLE",
          color: "#3b82f6",
          coordinates: { x1: 45.5, y1: 30.2, radius: 12 },
        },
        {
          id: "s2",
          type: "ARROW",
          color: "#ef4444",
          coordinates: { x1: 45.5, y1: 30.2, x2: 60.0, y2: 75.4 },
        },
      ],
      notes: "Rotate early off the weak-side corner when 4 steps into drop coverage.",
    });

    expect(createRes.statusCode).toBe(201);
    const annotation = createRes.json();
    expect(annotation.id).toBeDefined();
    expect(annotation.gameId).toBe(w.gameId);
    expect(annotation.clipId).toBe(w.clipId);
    expect(annotation.timestampMs).toBe(14200);
    expect(annotation.shapes).toHaveLength(2);

    // Player on team can retrieve the annotation
    const getRes = await call(t, w.player, "GET", `/api/v1/film/games/${w.gameId}/annotations/${annotation.id}`);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().title).toBe("Backdoor Cut & Help Rotation");

    // List annotations with clip filter
    const listRes = await call(t, w.player, "GET", `/api/v1/film/games/${w.gameId}/annotations?clipId=${w.clipId}`);
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().items).toHaveLength(1);
    expect(listRes.json().items[0].id).toBe(annotation.id);
  });

  it("updates and deletes keyframe annotations with author/coach permissions", async () => {
    const t = await setup();
    const w = await world(t);

    const createRes = await call(t, w.coach, "POST", `/api/v1/film/games/${w.gameId}/annotations`, {
      timestampMs: 18000,
      title: "Draft Note",
      shapes: [],
    });
    const annotId = createRes.json().id;

    // Update annotation
    const patchRes = await call(t, w.coach, "PATCH", `/api/v1/film/games/${w.gameId}/annotations/${annotId}`, {
      title: "Finalized Defensive Scheme",
      category: "DEFENSIVE_BREAKDOWN",
      durationMs: 5000,
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().title).toBe("Finalized Defensive Scheme");
    expect(patchRes.json().durationMs).toBe(5000);

    // Delete annotation
    const delRes = await call(t, w.coach, "DELETE", `/api/v1/film/games/${w.gameId}/annotations/${annotId}`);
    expect(delRes.statusCode).toBe(204);

    // Verify gone
    const verifyRes = await call(t, w.coach, "GET", `/api/v1/film/games/${w.gameId}/annotations/${annotId}`);
    expect(verifyRes.statusCode).toBe(404);
  });
});

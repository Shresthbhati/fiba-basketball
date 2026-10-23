import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const dir = fileURLToPath(new URL("../drizzle", import.meta.url));
const files = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const run = async (db: PGlite, file: string) => {
  for (const stmt of readFileSync(join(dir, file), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await db.exec(stmt);
};

describe("migration 0017 (sync points table)", () => {
  it("keeps the single sync point that existing films already had", async () => {
    const db = new PGlite();
    const before = files.filter((f) => f < "0017");
    for (const f of before) await run(db, f);
    const ids = { user: "00000000-0000-4000-8000-000000000001", team: "00000000-0000-4000-8000-000000000002", game1: "00000000-0000-4000-8000-000000000003", game2: "00000000-0000-4000-8000-000000000004", ev: "00000000-0000-4000-8000-000000000005" };
    await db.exec(`insert into users (id, email, password_hash, display_name, date_of_birth, is_minor) values ('${ids.user}', 'a@b.c', 'x', 'A', '1990-01-01', false)`);
    await db.exec(`insert into teams (id, name, created_by) values ('${ids.team}', 'T', '${ids.user}')`);
    await db.exec(`insert into film_games (id, team_id, title, created_by, sync_event_id, sync_video_ms) values ('${ids.game1}', '${ids.team}', 'synced', '${ids.user}', '${ids.ev}', 42000)`);
    await db.exec(`insert into film_games (id, team_id, title, created_by) values ('${ids.game2}', '${ids.team}', 'not synced', '${ids.user}')`);
    await run(db, "0017_film_sync_points.sql");
    const points = (await db.query<{ game_id: string; event_id: string; video_ms: number }>("select game_id, event_id, video_ms from film_sync_points")).rows;
    expect(points).toEqual([{ game_id: ids.game1, event_id: ids.ev, video_ms: 42000 }]);
    const cols = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'film_games'")).rows.map((r) => r.column_name);
    expect(cols).not.toContain("sync_event_id");
    expect(cols).not.toContain("sync_video_ms");
  });
});

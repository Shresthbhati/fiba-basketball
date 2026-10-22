import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { buildApp } from "../src/app.js";
import type { Db } from "../src/db/index.js";
import * as schema from "../src/db/schema.js";

export async function testApp() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  const app = await buildApp(db as unknown as Db, { secureCookies: false });
  return { app, db: db as unknown as Db };
}

export const adultBody = (over: Record<string, unknown> = {}) => ({
  email: "ada@example.com", password: "correct-horse-battery", displayName: "Ada", dateOfBirth: "1990-05-01", ...over,
});

export const cookieOf = (res: { headers: Record<string, unknown> }) =>
  String(([] as string[]).concat(res.headers["set-cookie"] as string | string[])[0]).split(";")[0]!;

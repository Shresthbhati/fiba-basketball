import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import type { Db } from "./index.js";
import * as schema from "./schema.js";

export async function connect(databaseUrl: string): Promise<Db> {
  const db = drizzle(new pg.Pool({ connectionString: databaseUrl }), { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
  return db as unknown as Db;
}

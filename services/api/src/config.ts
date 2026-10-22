import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().default(3001),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(env);
}

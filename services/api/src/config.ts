import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().default(3001),
  DATABASE_URL: z.string().optional(),
  RATE_LIMIT_SCALE: z.coerce.number().min(1).max(1000).default(1),
  WEB_BASE_URL: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  REDIS_URL: z.string().optional(),
  MAIL_OUTBOX_DIR: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(env);
}

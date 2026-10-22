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
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(env);
}

/**
 * In production a half-configured server is worse than one that refuses to start: sign-in would be blocked from the
 * browser, password-reset emails would never arrive, or abuse limits would be loosened. Returns every problem found.
 */
export function productionProblems(cfg: Config): string[] {
  if (cfg.NODE_ENV !== "production") return [];
  const problems: string[] = [];
  if (!cfg.DATABASE_URL) problems.push("DATABASE_URL is required");
  if (!cfg.ALLOWED_ORIGINS?.trim()) problems.push("ALLOWED_ORIGINS is required (the web app's origin, e.g. https://app.example.com), otherwise browser sign-in is blocked");
  if (!cfg.WEB_BASE_URL?.trim()) problems.push("WEB_BASE_URL is required so emailed links point at the web app");
  if (!cfg.SMTP_URL?.trim()) problems.push("SMTP_URL is required, otherwise password-reset and verification emails are never delivered");
  else if (!cfg.MAIL_FROM?.trim()) problems.push("MAIL_FROM is required when SMTP_URL is set");
  if (cfg.MAIL_OUTBOX_DIR) problems.push("MAIL_OUTBOX_DIR is a development setting and must not be set in production");
  if (cfg.RATE_LIMIT_SCALE !== 1) problems.push("RATE_LIMIT_SCALE must be 1 in production (it loosens sign-in abuse limits)");
  return problems;
}

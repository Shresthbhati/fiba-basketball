import { buildApp } from "./app.js";
import { loadConfig, productionProblems } from "./config.js";
import { connect } from "./db/connect.js";
import { createMailer } from "./identity/mailer-factory.js";

const cfg = loadConfig();
const problems = productionProblems(cfg);
if (problems.length > 0) {
  console.error(`Refusing to start in production:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
if (!cfg.DATABASE_URL) throw new Error("DATABASE_URL is required");

const app = await buildApp(await connect(cfg.DATABASE_URL), {
  logger: true,
  secureCookies: cfg.NODE_ENV === "production",
  requireVerifiedGuardianEmail: cfg.NODE_ENV === "production",
  rateLimitScale: cfg.RATE_LIMIT_SCALE,
  allowedOrigins: (cfg.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
  mailer: createMailer(cfg),
  ...(cfg.WEB_BASE_URL ? { webBaseUrl: cfg.WEB_BASE_URL } : {}),
});
await app.listen({ port: cfg.PORT, host: "0.0.0.0" });

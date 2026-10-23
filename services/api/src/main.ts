import { buildApp } from "./app.js";
import { loadConfig, productionProblems } from "./config.js";
import { connect } from "./db/connect.js";
import { deliverEmails } from "./notifications/email.js";
import { materializeAll } from "./pickup/series.js";
import { LocalDiskStorage } from "./media/storage.js";
import { createMailer } from "./identity/mailer-factory.js";

const cfg = loadConfig();
const problems = productionProblems(cfg);
if (problems.length > 0) {
  console.error(`Refusing to start in production:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
if (!cfg.DATABASE_URL) throw new Error("DATABASE_URL is required");

const db = await connect(cfg.DATABASE_URL);
const mailer = createMailer(cfg);
const app = await buildApp(db, {
  logger: true,
  secureCookies: cfg.NODE_ENV === "production",
  requireVerifiedGuardianEmail: cfg.NODE_ENV === "production",
  rateLimitScale: cfg.RATE_LIMIT_SCALE,
  allowedOrigins: (cfg.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
  mailer,
  storage: new LocalDiskStorage(cfg.MEDIA_DIR ?? "./data/media"),
  maxVideoBytes: cfg.MAX_VIDEO_MB * 1024 * 1024,
  ...(cfg.WEB_BASE_URL ? { webBaseUrl: cfg.WEB_BASE_URL } : {}),
});
await app.listen({ port: cfg.PORT, host: "0.0.0.0" });

// Keep recurring pickup games created a few weeks ahead (idempotent, so overlapping runs or several instances are harmless).
const refreshSeries = () => materializeAll(db).catch((e) => app.log.error({ err: e }, "recurring pickup refresh failed"));
await refreshSeries();
setInterval(refreshSeries, 60 * 60 * 1000).unref();

// Email time-sensitive notifications (game cancelled, spot opened). Each notification is claimed before sending, so overlapping runs are harmless.
const sendNotificationEmails = () =>
  deliverEmails(db, mailer, cfg.WEB_BASE_URL ?? `http://localhost:${cfg.PORT}`).catch((e) => app.log.error({ err: e }, "notification email run failed"));
setInterval(sendNotificationEmails, 60_000).unref();

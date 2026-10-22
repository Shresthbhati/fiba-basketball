import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { connect } from "./db/connect.js";
import { FileMailer } from "./identity/file-mailer.js";

const { PORT, DATABASE_URL, NODE_ENV, ALLOWED_ORIGINS, WEB_BASE_URL, MAIL_OUTBOX_DIR, RATE_LIMIT_SCALE } = loadConfig();
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const app = await buildApp(await connect(DATABASE_URL), {
  secureCookies: NODE_ENV === "production",
  requireVerifiedGuardianEmail: NODE_ENV === "production",
  rateLimitScale: RATE_LIMIT_SCALE,
  allowedOrigins: (ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
  ...(WEB_BASE_URL ? { webBaseUrl: WEB_BASE_URL } : {}),
  ...(MAIL_OUTBOX_DIR ? { mailer: new FileMailer(MAIL_OUTBOX_DIR) } : {}),
});
await app.listen({ port: PORT, host: "0.0.0.0" });

import type { Config } from "../config.js";
import { FileMailer } from "./file-mailer.js";
import { ConsoleMailer, type Mailer } from "./mailer.js";
import { SmtpMailer } from "./smtp-mailer.js";

/** Real SMTP wins; then the development outbox; otherwise just print emails to the console. */
export function createMailer(cfg: Pick<Config, "SMTP_URL" | "MAIL_FROM" | "MAIL_OUTBOX_DIR">): Mailer {
  if (cfg.SMTP_URL) return new SmtpMailer(cfg.SMTP_URL, cfg.MAIL_FROM ?? "COURT IQ <no-reply@localhost>");
  if (cfg.MAIL_OUTBOX_DIR) return new FileMailer(cfg.MAIL_OUTBOX_DIR);
  return new ConsoleMailer();
}

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Mail, Mailer } from "./mailer.js";

/**
 * Development/test outbox: writes each email as `<timestamp>-<id>.json` into `dir`
 * (created on demand) so browser tests can read the link that would have been emailed.
 * Never use in production; it is selected only through MAIL_OUTBOX_DIR.
 */
export class FileMailer implements Mailer {
  constructor(private readonly dir: string) {}
  async send(mail: Mail) {
    await mkdir(this.dir, { recursive: true });
    const name = `${Date.now().toString().padStart(15, "0")}-${randomUUID()}.json`;
    await writeFile(join(this.dir, name), JSON.stringify({ ...mail, sentAt: new Date().toISOString() }, null, 2), "utf8");
  }
}

import nodemailer, { type Transporter } from "nodemailer";
import type { Mail, Mailer } from "./mailer.js";

/** Sends real email over SMTP. `smtp` is a URL like smtp://user:pass@host:587 (smtps:// for implicit TLS) or a ready transport (tests). */
export class SmtpMailer implements Mailer {
  private readonly transport: Pick<Transporter, "sendMail">;
  constructor(smtp: string | Pick<Transporter, "sendMail">, private readonly from: string) {
    this.transport = typeof smtp === "string" ? nodemailer.createTransport(smtp) : smtp;
  }
  async send(mail: Mail) {
    await this.transport.sendMail({ from: this.from, to: mail.to, subject: mail.subject, text: mail.text });
  }
}

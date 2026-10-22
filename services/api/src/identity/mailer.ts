export type Mail = { to: string; subject: string; text: string };
export interface Mailer { send(mail: Mail): Promise<void> }

/** Development stand-in: prints the email. Replace with a real provider before going live. */
export class ConsoleMailer implements Mailer {
  async send(mail: Mail) {
    console.log(`[mail] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
  }
}

/** Collects emails in memory (tests). */
export class MemoryMailer implements Mailer {
  sent: Mail[] = [];
  async send(mail: Mail) { this.sent.push(mail); }
  last() { return this.sent.at(-1); }
}

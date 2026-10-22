import { expect, test, type Page } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

// The API must run with MAIL_OUTBOX_DIR pointing at this directory (FileMailer writes each email as JSON).
const OUTBOX = process.env.MAIL_OUTBOX_DIR ?? "/tmp/courtiq-outbox";
const run = Date.now().toString(36);
const OLD = "correct-horse-battery";
const NEW = "another-long-passphrase";

type Mail = { to: string; subject: string; text: string };

/** Newest email to `to` whose subject contains `subject`; polls because the API writes it asynchronously. */
async function mailLink(to: string, subject: string, path: string, after = 0): Promise<string> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const files = (await readdir(OUTBOX).catch(() => [] as string[])).sort().reverse();
    for (const f of files) {
      const mail = JSON.parse(await readFile(join(OUTBOX, f), "utf8")) as Mail & { sentAt: string };
      if (mail.to === to && mail.subject.includes(subject) && Date.parse(mail.sentAt) >= after) {
        const m = mail.text.match(new RegExp(`https?://[^\\s]*${path}\\?token=[\\w-]+`));
        if (m) return m[0];
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`No "${subject}" email for ${to} in ${OUTBOX}`);
}

const login = async (page: Page, email: string, password: string) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
};

test("account recovery: reset password, old session signed out, verify email", async ({ browser, page }) => {
  const email = `recover-${run}@example.com`;

  // Sign up; the unverified banner shows.
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Rita Recover");
  await page.getByLabel("Date of birth").fill("1990-05-06");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(OLD);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/pickup$/);
  await expect(page.getByRole("button", { name: "Resend verification email" })).toBeVisible();

  // Forgot password from a different browser context (no session): neutral message, same for an unknown address.
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await other.goto("/login");
  await other.getByRole("link", { name: "Forgot password?" }).click();
  await expect(other).toHaveURL(/\/forgot-password$/);
  const requestedAt = Date.now() - 1000;
  await other.getByLabel("Email").fill(email);
  await other.getByRole("button", { name: "Send reset link" }).click();
  await expect(other.locator("main").getByRole("status")).toHaveText("If an account exists for that email, we've sent a link");
  await other.goto("/forgot-password");
  await other.getByLabel("Email").fill(`nobody-${run}@example.com`);
  await other.getByRole("button", { name: "Send reset link" }).click();
  await expect(other.locator("main").getByRole("status")).toHaveText("If an account exists for that email, we've sent a link");

  // Follow the emailed link; validation first, then success.
  const resetLink = await mailLink(email, "Reset your COURT IQ password", "/reset-password", requestedAt);
  await other.goto(new URL(resetLink).pathname + new URL(resetLink).search);
  await other.getByLabel("New password", { exact: true }).fill(NEW);
  await other.getByLabel("Confirm new password").fill("something-else-entirely");
  await other.getByRole("button", { name: "Set new password" }).click();
  await expect(other.locator("main").getByRole("alert")).toContainText("don't match");
  await other.getByLabel("Confirm new password").fill(NEW);
  await other.getByRole("button", { name: "Set new password" }).click();
  await expect(other.locator("main").getByRole("status")).toContainText("password has been changed");
  await other.getByRole("link", { name: "Log in with your new password" }).click();
  await expect(other).toHaveURL(/\/login$/);

  // The used link no longer works.
  await other.goto(new URL(resetLink).pathname + new URL(resetLink).search);
  await other.getByLabel("New password", { exact: true }).fill("yet-another-passphrase");
  await other.getByLabel("Confirm new password").fill("yet-another-passphrase");
  await other.getByRole("button", { name: "Set new password" }).click();
  await expect(other.locator("main").getByRole("alert")).toContainText("invalid or has expired");
  await expect(other.getByRole("link", { name: "Request a new reset link" })).toBeVisible();

  // Old password fails, new password works.
  await login(other, email, OLD);
  await expect(other.locator("main").getByRole("alert")).toBeVisible();
  await expect(other).toHaveURL(/\/login$/);
  await login(other, email, NEW);
  await expect(other).toHaveURL(/\/pickup$/);
  await expect(other.getByText("Rita Recover")).toBeVisible();

  // The session from before the reset is signed out.
  await page.reload();
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
  await expect(page.getByText("Log out")).toHaveCount(0);

  // Verify the email using the link sent at sign-up, in the new session.
  await expect(other.getByRole("button", { name: "Resend verification email" })).toBeVisible();
  const verifyLink = await mailLink(email, "Confirm your COURT IQ email", "/verify-email");
  await other.goto(new URL(verifyLink).pathname + new URL(verifyLink).search);
  await expect(other.getByRole("heading", { name: "Email verified" })).toBeVisible();
  await other.goto("/pickup");
  await expect(other.getByText("Rita Recover")).toBeVisible();
  await expect(other.getByRole("button", { name: "Resend verification email" })).toHaveCount(0);

  // The same verification link is single-use.
  await other.goto(new URL(verifyLink).pathname + new URL(verifyLink).search);
  await expect(other.locator("main").getByRole("alert")).toContainText("invalid or has expired");
  await ctx.close();
});

test("account recovery: bogus tokens show a clear error", async ({ page }) => {
  const bogus = "x".repeat(43);
  await page.goto(`/verify-email?token=${bogus}`);
  await expect(page.locator("main").getByRole("alert")).toContainText("invalid or has expired");
  await page.goto(`/reset-password?token=${bogus}`);
  await page.getByLabel("New password", { exact: true }).fill(NEW);
  await page.getByLabel("Confirm new password").fill(NEW);
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("invalid or has expired");
  await page.goto("/reset-password");
  await expect(page.locator("main").getByRole("alert")).toContainText("invalid or has expired");
});

test("resend verification email sends a fresh link", async ({ page }) => {
  const email = `resend-${run}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Reese Resend");
  await page.getByLabel("Date of birth").fill("1991-01-02");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(OLD);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/pickup$/);
  const first = await mailLink(email, "Confirm your COURT IQ email", "/verify-email");
  await page.getByRole("button", { name: "Resend verification email" }).click();
  await expect(page.getByText(/Verification email sent/)).toBeVisible();
  await expect.poll(() => mailLink(email, "Confirm your COURT IQ email", "/verify-email")).not.toBe(first);
});

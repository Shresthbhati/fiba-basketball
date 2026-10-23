import { expect, test, type Browser, type Page } from "@playwright/test";

const run = Date.now().toString(36);
const pad = (n: number) => String(n).padStart(2, "0");
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

async function signUp(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Date of birth").fill("1992-03-04");
  await page.getByLabel("Email").fill(`${name.toLowerCase().replace(/\W/g, "")}-${run}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/pickup$/);
  return page;
}

test("notifications: a player hears the game was cancelled, sees the count, opens it, and the count clears", async ({ browser }) => {
  const lat = (36 + (Date.now() % 1000) / 10000).toFixed(4);
  const lng = (-50 - (Date.now() % 997) / 10000).toFixed(4);

  const host = await signUp(browser, "Nia Notifier");
  await host.goto("/courts");
  await host.getByText("Add a court that isn't listed").click();
  const form = host.getByRole("form", { name: "Add a court" });
  await form.getByLabel("Court name").fill(`Notify Court ${run}`);
  await form.getByLabel("Latitude").fill(lat);
  await form.getByLabel("Longitude").fill(lng);
  await form.getByRole("button", { name: "Add court" }).click();
  await host.getByRole("listitem").filter({ hasText: `Notify Court ${run}` }).getByRole("link", { name: "Host a game here" }).click();
  await host.getByLabel("Title").fill(`Cancel me ${run}`);
  await host.getByLabel("Starts").fill(local(new Date(Date.now() + 3 * 3_600_000)));
  await host.getByLabel("Ends").fill(local(new Date(Date.now() + 5 * 3_600_000)));
  await host.getByRole("button", { name: "Create game" }).click();
  await expect(host.getByRole("heading", { name: `Cancel me ${run}` })).toBeVisible();
  const gameUrl = host.url();

  const player = await signUp(browser, "Pete Player");
  await player.goto(gameUrl);
  await player.getByRole("button", { name: "Join game" }).click();
  await expect(player.getByText("You're in")).toBeVisible();
  await expect(player.getByRole("link", { name: /^Notifications/ })).toHaveAccessibleName("Notifications"); // nothing yet

  await host.getByRole("button", { name: "Cancel game" }).click();
  await expect(host.locator("main").getByRole("status").first()).toContainText("Cancelled");

  // The player's nav shows one unread after the next poll/navigation.
  await player.goto("/pickup");
  await expect(player.getByRole("link", { name: "Notifications, 1 unread" })).toBeVisible();
  await player.getByRole("link", { name: "Notifications, 1 unread" }).click();
  await expect(player.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(player.getByText("(unread)")).toHaveCount(1);
  // The email preference is on by default, can be turned off, and the choice survives a reload.
  const emailBox = player.getByLabel(/Email me when a game is cancelled/);
  await expect(emailBox).toBeChecked();
  await emailBox.uncheck();
  await player.reload();
  await expect(player.getByLabel(/Email me when a game is cancelled/)).not.toBeChecked();
  await player.getByRole("link", { name: `Cancelled: "Cancel me ${run}"` }).click();
  await expect(player).toHaveURL(gameUrl);
  await expect(player.getByRole("link", { name: "Notifications" })).toBeVisible(); // no unread count any more

  // The host is not told about their own cancellation.
  await host.goto("/notifications");
  await expect(host.getByText(/Nothing yet/)).toBeVisible();
});

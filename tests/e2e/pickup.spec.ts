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

const status = (p: Page) => p.locator("main").getByRole("status").first();

test("pickup: add a court, host a game, join, waitlist, cancel promotes the waitlist, check in, roster privacy", async ({ browser }) => {
  // A spot in the middle of the Atlantic keeps this court away from any other test data.
  const lat = (30 + (Date.now() % 1000) / 10000).toFixed(4);
  const lng = (-40 - (Date.now() % 997) / 10000).toFixed(4);

  // Host adds a court in the UI, finds it, and hosts a game that starts in 10 minutes (check-in opens 30 min early).
  const host = await signUp(browser, "Hana Host");
  await host.goto("/courts");
  await host.getByText("Add a court that isn't listed").click();
  const form = host.getByRole("form", { name: "Add a court" });
  await form.getByLabel("Court name").fill(`Test Court ${run}`);
  await form.getByLabel("Latitude").fill(lat);
  await form.getByLabel("Longitude").fill(lng);
  await form.getByLabel("Surface (optional)").fill("asphalt");
  await form.getByRole("button", { name: "Add court" }).click();
  const card = host.getByRole("listitem").filter({ hasText: `Test Court ${run}` });
  await expect(card).toContainText("Outdoor · asphalt");
  await expect(card).toContainText("Unverified");
  await card.getByRole("link", { name: "Host a game here" }).click();

  await host.getByLabel("Title").fill(`Run ${run}`);
  await host.getByLabel("Starts").fill(local(new Date(Date.now() + 10 * 60_000)));
  await host.getByLabel("Ends").fill(local(new Date(Date.now() + 2 * 3_600_000)));
  await host.getByLabel(/Players/).fill("2");
  await host.getByRole("button", { name: "Create game" }).click();
  await expect(host.getByRole("heading", { name: `Run ${run}` })).toBeVisible();
  await expect(status(host)).toContainText("Open");
  await expect(status(host)).toContainText("1/2 players");
  await expect(host.getByRole("button", { name: "Leave game" })).toHaveCount(0); // hosts cancel, they don't leave
  const gameUrl = host.url();

  // Second player finds the game by searching near the court, and takes the last spot.
  const p2 = await signUp(browser, "Pia Player");
  await p2.goto("/pickup");
  await p2.getByLabel("Latitude").fill(lat);
  await p2.getByLabel("Longitude").fill(lng);
  await p2.getByLabel("Radius").selectOption("2000");
  await p2.getByRole("button", { name: "Find games" }).click();
  await p2.getByRole("link", { name: `Run ${run}` }).click();
  await expect(p2.getByText("Join the game to see who's playing.")).toBeVisible(); // roster hidden from outsiders
  await p2.getByRole("button", { name: "Join game" }).click();
  await expect(p2.getByText("You're in.")).toBeVisible();
  await expect(status(p2)).toContainText("Full");
  await expect(p2.getByRole("listitem").filter({ hasText: "Hana Host" })).toBeVisible(); // roster now visible

  // Third player lands on the waitlist.
  const p3 = await signUp(browser, "Tom Third");
  await p3.goto(gameUrl);
  await p3.getByRole("button", { name: "Join waitlist" }).click();
  await expect(p3.getByText(/You're on the waitlist/)).toBeVisible();
  await expect(p3.getByRole("button", { name: "Check in" })).toHaveCount(0); // waitlisted players can't check in

  // Second player leaves; the waitlisted player is promoted without doing anything.
  await p2.getByRole("button", { name: "Leave game" }).click();
  await expect(p2.getByRole("button", { name: "Join waitlist" })).toBeVisible(); // still full: Tom took the spot
  await expect(p2.getByText("Join the game to see who's playing.")).toBeVisible(); // and the roster is hidden again
  await p3.reload();
  await expect(p3.getByText("You're in.")).toBeVisible();

  // Check-in is open (game starts in 10 minutes) and idempotent.
  await p3.getByRole("button", { name: "Check in" }).click();
  await expect(status(p3)).toContainText("1 checked in");
  await p3.getByRole("button", { name: "Check in" }).click();
  await expect(status(p3)).toContainText("1 checked in");

  // The host sees it, and the game is not completed by the passage of time or by anyone but the host.
  await host.reload();
  await expect(host.getByRole("listitem").filter({ hasText: "Tom Third" })).toContainText("checked in");
  await expect(host.getByRole("button", { name: "Confirm it was played" })).toHaveCount(0); // hasn't started yet
  await expect(p3.getByRole("button", { name: "Confirm it was played" })).toHaveCount(0);
});

test("pickup: logged-out visitors can browse but are told to log in to join", async ({ browser, page }) => {
  const host = await signUp(browser, "Lena Host");
  const lat = (31 + (Date.now() % 1000) / 10000).toFixed(4);
  const lng = (-41 - (Date.now() % 997) / 10000).toFixed(4);
  await host.goto("/courts");
  await host.getByText("Add a court that isn't listed").click();
  const form = host.getByRole("form", { name: "Add a court" });
  await form.getByLabel("Court name").fill(`Guest Court ${run}`);
  await form.getByLabel("Latitude").fill(lat);
  await form.getByLabel("Longitude").fill(lng);
  await form.getByRole("button", { name: "Add court" }).click();
  await host.getByRole("listitem").filter({ hasText: `Guest Court ${run}` }).getByRole("link", { name: "Host a game here" }).click();
  await host.getByLabel("Title").fill(`Open run ${run}`);
  await host.getByLabel("Starts").fill(local(new Date(Date.now() + 3 * 3_600_000)));
  await host.getByLabel("Ends").fill(local(new Date(Date.now() + 5 * 3_600_000)));
  await host.getByRole("button", { name: "Create game" }).click();
  await expect(host.getByRole("heading", { name: `Open run ${run}` })).toBeVisible();

  await page.goto(host.url());
  await expect(page.getByRole("heading", { name: `Open run ${run}` })).toBeVisible();
  await page.getByRole("button", { name: "Join game" }).click();
  await expect(page.getByText("Log in first.")).toBeVisible();
});

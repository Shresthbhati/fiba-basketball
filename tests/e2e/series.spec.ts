import { expect, test } from "@playwright/test";

const run = Date.now().toString(36);
const pad = (n: number) => String(n).padStart(2, "0");
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

test("pickup: host a weekly game, see the coming weeks, stop the series", async ({ page }) => {
  const lat = (35 + (Date.now() % 1000) / 10000).toFixed(4);
  const lng = (-45 - (Date.now() % 997) / 10000).toFixed(4);

  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Wes Weekly");
  await page.getByLabel("Date of birth").fill("1991-02-03");
  await page.getByLabel("Email").fill(`weekly-${run}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/pickup$/);

  await page.goto("/courts");
  await page.getByText("Add a court that isn't listed").click();
  const form = page.getByRole("form", { name: "Add a court" });
  await form.getByLabel("Court name").fill(`Weekly Court ${run}`);
  await form.getByLabel("Latitude").fill(lat);
  await form.getByLabel("Longitude").fill(lng);
  await form.getByRole("button", { name: "Add court" }).click();
  await page.getByRole("listitem").filter({ hasText: `Weekly Court ${run}` }).getByRole("link", { name: "Host a game here" }).click();

  // Starts tomorrow evening, repeats weekly.
  const start = new Date(Date.now() + 24 * 3_600_000);
  start.setHours(18, 0, 0, 0);
  await page.getByLabel("Title").fill(`Weekly ${run}`);
  await page.getByLabel("Starts").fill(local(start));
  await page.getByLabel("Ends").fill(local(new Date(start.getTime() + 2 * 3_600_000)));
  await page.getByLabel("Repeat every week at this time").check();
  await page.getByRole("button", { name: "Create game" }).click();
  await expect(page).toHaveURL(/\/pickup$/);

  // "Your weekly games" lists it; searching near the court shows the coming weeks as separate games.
  const mine = page.getByRole("region", { name: "Your weekly games" });
  await expect(mine).toContainText(`Weekly ${run}`);
  await expect(mine).toContainText("at 18:00");
  await page.getByLabel("Latitude").fill(lat);
  await page.getByLabel("Longitude").fill(lng);
  await page.getByLabel("Radius").selectOption("2000");
  await page.getByRole("button", { name: "Find games" }).click();
  const games = page.getByRole("link", { name: `Weekly ${run}` });
  await expect.poll(() => games.count()).toBeGreaterThanOrEqual(4);
  await expect(page.getByText("1/10 players").first()).toBeVisible();

  // Stopping the series cancels the upcoming games.
  await mine.getByRole("button", { name: `Stop Weekly ${run}` }).click();
  await expect(mine).toHaveCount(0);
  await page.getByRole("button", { name: "Find games" }).click();
  await expect(page.getByText("No upcoming games in this area.")).toBeVisible(); // cancelled games drop out of search
  await expect(page.getByRole("link", { name: `Weekly ${run}` })).toHaveCount(0);
});

import { expect, test } from "@playwright/test";

const run = Date.now().toString(36);

test("organizer runs a round-robin: sign up, create, add teams, schedule, score offline, finish, standings", async ({ page, context }) => {
  page.on("dialog", (d) => void d.accept()); // "Finish game?" confirm

  // Sign up
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Olga Organizer");
  await page.getByLabel("Date of birth").fill("1990-04-02");
  await page.getByLabel("Email").fill(`olga-${run}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/pickup$/);
  await expect(page.getByText("Olga Organizer")).toBeVisible();

  // Create a competition
  await page.goto("/competitions/new");
  await page.getByLabel("Name").fill(`Cup ${run}`);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: `Cup ${run}` })).toBeVisible();
  await expect(page.getByText("Draft — only you can see it")).toBeVisible();
  const competitionUrl = page.url();
  await expect(page.getByRole("button", { name: "Create schedule and publish" })).toBeDisabled();

  // Add two teams
  for (const name of ["Reds", "Blues"]) {
    await page.getByLabel("Team name").fill(name);
    await page.getByRole("button", { name: "Add team" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  }

  // Schedule
  await page.getByRole("button", { name: "Create schedule and publish" }).click();
  await expect(page.getByText("Under way")).toBeVisible();
  const round = page.getByLabel("Round 1");
  await expect(round).toContainText("Reds");
  await expect(round).toContainText("Blues");

  // Score: the page is loaded, then the network drops; the buttons keep working and events are kept on the device.
  await round.getByRole("link", { name: "Open scorer" }).click();
  await expect(page.getByRole("heading", { name: "Scorekeeper" })).toBeVisible();
  await expect(page.locator("main").getByRole("status").first()).toContainText("All changes saved");
  await context.setOffline(true);
  await page.getByLabel("Home +3 points").click();
  await page.getByLabel("Home +2 points").click();
  await page.getByLabel("Away +2 points").click();
  await expect(page.getByLabel("Home").getByText("5")).toBeVisible();
  await expect(page.getByLabel("Away").getByText("2", { exact: true })).toBeVisible();
  await expect(page.locator("main").getByRole("status").first()).toContainText("3 waiting to send");

  // Reconnect: the queued events sync on their own.
  await context.setOffline(false);
  await expect(page.locator("main").getByRole("status").first()).toContainText("All changes saved", { timeout: 15_000 });
  await expect(page.locator("main").getByRole("status").first()).not.toContainText("waiting to send");

  // Reload: server state is the source of truth and the score is unchanged.
  await page.reload();
  await expect(page.getByLabel("Home").getByText("5")).toBeVisible();

  // Finish the game and check the public standings.
  await page.getByRole("button", { name: "Finish game" }).click();
  await expect(page.getByText("Game finalized.")).toBeVisible();
  await page.goto(competitionUrl);
  const table = page.getByLabel("Standings");
  await expect(table).toBeVisible();
  await expect(table.getByRole("row").nth(1)).toContainText("Reds"); // 5-2 winner is ranked first
  await expect(page.getByText("Completed")).toBeVisible();
});

test("a stranger cannot see a draft competition", async ({ browser, page }) => {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Dana");
  await page.getByLabel("Date of birth").fill("1991-01-01");
  await page.getByLabel("Email").fill(`dana-${run}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/pickup$/); // wait for sign-up to finish before navigating away
  await page.goto("/competitions/new");
  await page.getByLabel("Name").fill(`Private ${run}`);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: `Private ${run}` })).toBeVisible();
  const url = page.url();

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(url);
  await expect(guest.getByText("This competition doesn't exist or isn't published yet.")).toBeVisible();
  await guest.goto("/competitions");
  await expect(guest.getByText(`Private ${run}`)).toHaveCount(0);
});

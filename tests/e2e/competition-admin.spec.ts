import { expect, test } from "@playwright/test";

const run = Date.now().toString(36);

test("organizer runs a competition: match time, direct score, correction, lock, forfeit, named scorer", async ({ page }) => {
  page.on("dialog", (d) => void d.accept());

  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Ola Admin");
  await page.getByLabel("Date of birth").fill("1988-03-04");
  await page.getByLabel("Email").fill(`ola-${run}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/pickup$/);

  await page.goto("/competitions/new");
  await page.getByLabel("Name").fill(`Admin Cup ${run}`);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: `Admin Cup ${run}` })).toBeVisible();
  const competitionUrl = page.url();

  for (const name of ["Reds", "Blues", "Greens"]) {
    await page.getByLabel("Team name").fill(name);
    await page.getByRole("button", { name: "Add team" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  }
  await page.getByRole("button", { name: "Create schedule and publish" }).click();
  await expect(page.getByText("Under way")).toBeVisible();

  // Round robin of 3: Reds-Blues, Reds-Greens, Blues-Greens (any order). Work with the first two cards by position.
  const cards = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Enter final score" }) });
  await expect(cards).toHaveCount(3);
  const first = cards.nth(0);
  const second = cards.nth(1);
  const firstLabel = (await first.getAttribute("aria-label"))!;
  const secondLabel = (await second.getAttribute("aria-label"))!;
  const byLabel = (label: string) => page.getByLabel(label, { exact: true });

  // Set a match time and see it.
  await byLabel(firstLabel).getByLabel("Match time").fill("2031-06-01T18:30");
  await byLabel(firstLabel).getByRole("button", { name: "Set time" }).click();
  await expect(byLabel(firstLabel).getByText(/Scheduled for/)).toBeVisible();
  await page.reload();
  await expect(byLabel(firstLabel).getByText(/Scheduled for/)).toBeVisible();

  // Enter a score directly, then correct it.
  await byLabel(firstLabel).getByLabel("Home score").fill("70");
  await byLabel(firstLabel).getByLabel("Away score").fill("60");
  await byLabel(firstLabel).getByRole("button", { name: "Enter final score" }).click();
  await expect(byLabel(firstLabel).getByText("Final", { exact: true })).toBeVisible();
  await expect(byLabel(firstLabel)).toContainText("70 : 60");
  await byLabel(firstLabel).getByLabel("Away score").fill("75");
  await byLabel(firstLabel).getByRole("button", { name: "Correct score" }).click();
  await expect(byLabel(firstLabel)).toContainText("70 : 75");

  // Lock it: no further edits are offered, and the API refuses them.
  await byLabel(firstLabel).getByRole("button", { name: "Lock result" }).click();
  await expect(byLabel(firstLabel).getByText("Final (locked)")).toBeVisible();
  await expect(byLabel(firstLabel).getByRole("button", { name: "Correct score" })).toHaveCount(0);
  const list = await page.evaluate(async (cid) => (await fetch(`/api/v1/competitions/${cid}/matches`)).json(), competitionUrl.split("/").pop());
  const lockedId = list.items.find((m: { state: string }) => m.state === "LOCKED").id;
  const refused = await page.evaluate(async (id) =>
    (await fetch(`/api/v1/matches/${id}/result`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ homeScore: 1, awayScore: 2 }) })).status, lockedId);
  expect(refused).toBe(409);

  // Forfeit a different match. Pick the team that has not played yet, so its table points are exactly the forfeit loss.
  const teamsOf = (label: string) => label.replace("Match ", "").split(" vs ") as [string, string];
  const [h2, a2t] = teamsOf(secondLabel);
  const firstTeams = teamsOf(firstLabel);
  const forfeiter = firstTeams.includes(h2) ? a2t : h2;
  await byLabel(secondLabel).getByLabel("Team that forfeits").selectOption({ label: `${forfeiter} forfeits` });
  await byLabel(secondLabel).getByRole("button", { name: "Record forfeit" }).click();
  await expect(byLabel(secondLabel).getByText(/Final \(forfeit\)/)).toBeVisible();
  const after = await page.evaluate(async (cid) => (await fetch(`/api/v1/competitions/${cid}/matches`)).json(), competitionUrl.split("/").pop());
  const forfeited = after.items.find((m: { forfeit: boolean }) => m.forfeit);
  expect(forfeited).toMatchObject({ state: "FINISHED" });
  expect(Math.max(forfeited.homeScore, forfeited.awayScore)).toBe(20);
  expect(Math.min(forfeited.homeScore, forfeited.awayScore)).toBe(0);
  const table = page.getByLabel("Standings");
  await expect(table).toBeVisible();
  const row = table.getByRole("row").filter({ hasText: forfeiter });
  await expect(row.locator("td").last()).toHaveText("0"); // forfeit loser: 0 table points

  // The scorer page for the remaining match shows team names and the competition, not Home/Away.
  const third = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Open scorer" }) });
  const thirdLabel = (await third.first().getAttribute("aria-label"))!;
  await third.first().getByRole("link", { name: "Open scorer" }).click();
  await expect(page.getByRole("heading", { name: "Scorekeeper" })).toBeVisible();
  await expect(page.getByLabel("Match details")).toContainText(`Admin Cup ${run}`);
  const [h3, a3] = teamsOf(thirdLabel);
  await expect(page.getByLabel(h3, { exact: true })).toBeVisible();
  await expect(page.getByLabel(a3, { exact: true })).toBeVisible();
  await expect(page.getByLabel("Home", { exact: true })).toHaveCount(0);
});

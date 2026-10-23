import { expect, test, type Browser, type Page } from "@playwright/test";

const run = Date.now().toString(36);

async function signUp(browser: Browser, name: string): Promise<{ page: Page; email: string }> {
  const page = await (await browser.newContext()).newPage();
  const email = `${name.toLowerCase().replace(/\W/g, "")}-${run}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Date of birth").fill("1991-05-06");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/pickup$/);
  return { page, email };
}

test("box score: score with players picked from rosters, then see the box score (jerseys public, names for the organizer)", async ({ browser }) => {
  const org = (await signUp(browser, "Bo Scorer")).page;
  const pia = await signUp(browser, "Pia Guard");
  const sam = await signUp(browser, "Sam Wing");
  const fan = await (await browser.newContext()).newPage();

  await org.goto("/competitions/new");
  await org.getByLabel("Name").fill(`Box Cup ${run}`);
  await org.getByRole("button", { name: "Create" }).click();
  await expect(org.getByRole("heading", { name: `Box Cup ${run}` })).toBeVisible();
  const competitionUrl = org.url();
  for (const name of ["Comets", "Blazers"]) {
    await org.getByLabel("Team name").fill(name);
    await org.getByRole("button", { name: "Add team" }).click();
    await expect(org.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  }

  // Put one player on each team and roster them with jersey numbers (the organizer coaches both teams).
  const rosterLinks = org.getByRole("link", { name: "Roster" });
  const teamPages: string[] = [];
  for (const [i, player, jersey, who] of [[0, pia, "7", "Pia Guard"], [1, sam, "23", "Sam Wing"]] as const) {
    await rosterLinks.nth(i).click();
    await org.waitForURL(/\/teams\/[0-9a-f-]{36}$/);
    const rosterUrl = org.url();
    const teamId = /teams\/([0-9a-f-]{36})/.exec(rosterUrl)![1]!;
    teamPages.push(teamId);
    await org.goto(`/teams/${teamId}`);
    await org.getByLabel(/Email of an existing account/).fill(player.email);
    await org.getByRole("button", { name: "Add to team" }).click();
    await expect(org.getByText(/· Player/)).toBeVisible();
    await org.goto(rosterUrl);
    const form = org.getByRole("form", { name: "Add a player" });
    await form.getByLabel("Player").selectOption({ label: who });
    await form.getByLabel("Jersey number").fill(jersey);
    await form.getByRole("button", { name: "Add to roster" }).click();
    await expect(org.getByText(`#${jersey}`)).toBeVisible();
    await org.goto(competitionUrl);
  }

  await org.getByRole("button", { name: "Create schedule and publish" }).click();
  await expect(org.getByText("Under way")).toBeVisible();
  await org.getByRole("link", { name: "Open scorer" }).click();
  await expect(org.getByRole("heading", { name: "Scorekeeper" })).toBeVisible();

  // Pick each team's player once, then score.
  const comets = org.getByRole("region", { name: "Comets" });
  const blazers = org.getByRole("region", { name: "Blazers" });
  await comets.getByRole("button", { name: "#7 Pia Guard" }).click();
  await blazers.getByRole("button", { name: "#23 Sam Wing" }).click();
  await comets.getByRole("button", { name: "Comets +3 points" }).click();
  await comets.getByRole("button", { name: "Comets +2 points" }).click();
  await blazers.getByRole("button", { name: "Blazers +2 points" }).click();
  await blazers.getByText("More stats").click();
  await blazers.getByRole("button", { name: "Blazers Rebound" }).click();
  await comets.getByRole("button", { name: "No player" }).click();
  await comets.getByRole("button", { name: "Comets +1 points" }).click(); // credited to nobody
  await expect(org.locator("main").getByRole("status").first()).toContainText("All changes saved");
  await expect(comets.getByLabel(/./).first()).toBeVisible();

  // Organizer's competition page: names + numbers. A signed-out visitor: numbers only.
  await org.goto(competitionUrl);
  const matchRow = org.getByRole("listitem", { name: /Match/ });
  await matchRow.getByText("Box score").click();
  const cometsBox = matchRow.getByRole("table", { name: "Comets box score" });
  await expect(cometsBox.getByRole("row", { name: /#7 Pia Guard/ })).toContainText("5"); // 3 + 2 points
  await expect(cometsBox.getByRole("row", { name: /Not credited to a player/ })).toContainText("1");
  await expect(cometsBox.getByRole("row", { name: /^Team/ })).toContainText("6");
  await expect(matchRow.getByRole("table", { name: "Blazers box score" }).getByRole("row", { name: /#23 Sam Wing/ })).toBeVisible();

  await fan.goto(competitionUrl);
  const fanRow = fan.getByRole("listitem", { name: /Match/ });
  await fanRow.getByText("Box score").click();
  const fanBox = fanRow.getByRole("table", { name: "Comets box score" });
  await expect(fanBox.getByRole("row", { name: /#7/ })).toContainText("5");
  await expect(fan.getByText("Pia Guard")).toHaveCount(0); // names are not public
});

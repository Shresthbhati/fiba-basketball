import { expect, test, type Browser, type Page } from "@playwright/test";

const run = Date.now().toString(36);

async function signUp(browser: Browser, name: string, dob = "1991-05-06"): Promise<{ page: Page; email: string }> {
  const page = await (await browser.newContext()).newPage();
  const email = `${name.toLowerCase().replace(/\W/g, "")}-${run}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Date of birth").fill(dob);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/pickup$/);
  return { page, email };
}

test("rosters: organizer's team gets players with jersey numbers; players see it; outsiders don't; closes when published", async ({ browser }) => {
  const org = (await signUp(browser, "Rita Roster")).page;
  const pia = await signUp(browser, "Pia Guard");
  const sam = await signUp(browser, "Sam Wing");
  const outsider = (await signUp(browser, "Olly Outside")).page;

  // Organizer creates a competition and a team in it (the creator becomes the team's coach), then adds two players to the team.
  await org.goto("/competitions/new");
  await org.getByLabel("Name").fill(`Roster Cup ${run}`);
  await org.getByRole("button", { name: "Create" }).click();
  await expect(org.getByRole("heading", { name: `Roster Cup ${run}` })).toBeVisible();
  const competitionUrl = org.url();
  await org.getByLabel("Team name").fill("Comets");
  await org.getByRole("button", { name: "Add team" }).click();
  await expect(org.getByRole("listitem").filter({ hasText: "Comets" })).toBeVisible();

  await org.goto("/teams");
  await org.getByRole("link", { name: "Comets" }).click();
  for (const [p, name] of [[pia, "Pia Guard"], [sam, "Sam Wing"]] as const) {
    await org.getByLabel(/Email of an existing account/).fill(p.email);
    await org.getByRole("button", { name: "Add to team" }).click();
    await expect(org.getByText(`${name} · Player`)).toBeVisible(); // wait for each add before the next
  }
  await org.getByRole("link", { name: "Roster" }).click(); // from the team page's Competitions section
  await expect(org.getByRole("heading", { name: "Roster" })).toBeVisible();
  await expect(org.getByText("No players on the roster yet.")).toBeVisible();

  const add = async (name: string, jersey: string) => {
    const form = org.getByRole("form", { name: "Add a player" });
    await form.getByLabel("Player").selectOption({ label: name });
    await form.getByLabel("Jersey number").fill(jersey);
    await form.getByRole("button", { name: "Add to roster" }).click();
  };
  await add("Pia Guard", "7");
  await expect(org.getByText("#7")).toBeVisible();
  // A duplicate jersey number is refused with a reason, and the roster is unchanged.
  await add("Sam Wing", "7");
  await expect(org.locator("main").getByRole("alert")).toContainText("Jersey number 7 is already taken");
  await add("Sam Wing", "23");
  await expect(org.getByText("#23")).toBeVisible();
  await expect(org.getByText(/2 of 15 players/)).toBeVisible();

  // The player was told, and sees the roster read-only.
  await pia.page.goto("/notifications");
  await expect(pia.page.getByRole("link", { name: /You are on Comets's roster for Roster Cup/ })).toBeVisible();
  await pia.page.goto("/teams");
  await pia.page.getByRole("link", { name: "Comets" }).click();
  await pia.page.getByRole("link", { name: "Roster" }).click();
  await expect(pia.page.getByText("Sam Wing")).toBeVisible();
  await expect(pia.page.getByText(/roster is closed/)).toBeVisible();
  await expect(pia.page.getByRole("form", { name: "Add a player" })).toHaveCount(0);

  // A stranger gets "not found" in the page and from the API.
  const rosterUrl = org.url();
  await outsider.goto(rosterUrl);
  await expect(outsider.getByText(/could not find that roster/)).toBeVisible();
  const [, cid, tid] = /competitions\/([0-9a-f-]{36})\/teams\/([0-9a-f-]{36})/.exec(rosterUrl)!;
  expect((await outsider.request.get(`/api/v1/competitions/${cid}/teams/${tid}/roster`)).status()).toBe(404);

  // Once the organizer publishes, the coach-only edits close; players still see the roster.
  await org.goto(competitionUrl);
  await org.getByLabel("Team name").fill("Blazers");
  await org.getByRole("button", { name: "Add team" }).click();
  await expect(org.getByRole("listitem").filter({ hasText: "Blazers" })).toBeVisible();
  await org.getByRole("button", { name: "Create schedule and publish" }).click();
  await expect(org.getByText("Under way")).toBeVisible();
  await pia.page.reload();
  await expect(pia.page.getByText("Sam Wing")).toBeVisible();
});

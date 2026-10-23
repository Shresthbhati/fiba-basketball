import { expect, test, type Browser, type Page } from "@playwright/test";

const run = Date.now().toString(36);

async function signUp(browser: Browser, name: string, dob: string): Promise<{ page: Page; email: string }> {
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

test("teen players: rostered only after a guardian allows competition play, and removed when it is withdrawn", async ({ browser }) => {
  const coach = (await signUp(browser, "Cora Coach", "1988-03-02")).page;
  const teen = await signUp(browser, "Tia Teen", "2012-01-15");
  const guardian = await signUp(browser, "Gus Guardian", "1980-07-09");

  // The teen invites a guardian; the guardian accepts from their own account and allows competition play.
  await teen.page.goto("/safety");
  await teen.page.getByLabel("Guardian email").fill(guardian.email);
  await teen.page.getByRole("button", { name: "Invite" }).click();
  await guardian.page.goto("/safety");
  await guardian.page.getByRole("button", { name: "Accept" }).click();
  await expect(guardian.page.getByRole("heading", { name: "Permissions for Tia Teen" })).toBeVisible();

  // Joining a team needs media consent (film); competition play is a separate permission.
  await guardian.page.getByRole("button", { name: "Allow: Use photos and video of them" }).last().click();
  await expect(guardian.page.getByText("Use photos and video of them: allowed").last()).toBeVisible();

  // Coach: competition + team, and the teen on the team.
  await coach.goto("/competitions/new");
  await coach.getByLabel("Name").fill(`Teen Cup ${run}`);
  await coach.getByRole("button", { name: "Create" }).click();
  await expect(coach.getByRole("heading", { name: `Teen Cup ${run}` })).toBeVisible();
  await coach.getByLabel("Team name").fill("Juniors");
  await coach.getByRole("button", { name: "Add team" }).click();
  await expect(coach.getByRole("listitem").filter({ hasText: "Juniors" })).toBeVisible();
  await coach.goto("/teams");
  await coach.getByRole("link", { name: "Juniors" }).click();
  await coach.getByLabel(/Email of an existing account/).fill(teen.email);
  await coach.getByRole("button", { name: "Add to team" }).click();
  await expect(coach.getByText("Tia Teen · Player")).toBeVisible();
  await coach.getByRole("link", { name: "Roster" }).click();
  await expect(coach.getByRole("heading", { name: "Roster" })).toBeVisible();

  // Without consent the teen is not offered, and the API refuses.
  const form = coach.getByRole("form", { name: "Add a player" });
  await expect(form.getByLabel("Player").locator("option", { hasText: "Tia Teen" })).toHaveCount(0);
  const [, cid, tid] = /competitions\/([0-9a-f-]{36})\/teams\/([0-9a-f-]{36})/.exec(coach.url())!;

  // The guardian allows competition play; now the teen can be added.
  await guardian.page.getByRole("button", { name: "Allow: Play in organised competitions" }).last().click();
  await expect(guardian.page.getByText("Play in organised competitions: allowed").last()).toBeVisible();
  await coach.reload();
  await form.getByLabel("Player").selectOption({ label: "Tia Teen" });
  await form.getByLabel("Jersey number").fill("4");
  await form.getByRole("button", { name: "Add to roster" }).click();
  await expect(coach.getByText("#4")).toBeVisible();

  // The guardian withdraws it: the teen drops off the roster.
  await guardian.page.getByRole("button", { name: "Withdraw: Play in organised competitions" }).click();
  await expect(guardian.page.getByText("Play in organised competitions: not allowed").last()).toBeVisible();
  await coach.reload();
  await expect(coach.getByText("No players on the roster yet.")).toBeVisible();
  const roster = await (await coach.request.get(`/api/v1/competitions/${cid}/teams/${tid}/roster`)).json();
  expect(roster.items).toHaveLength(0);
});

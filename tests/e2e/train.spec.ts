import { expect, test, type Page } from "@playwright/test";

const run = Date.now().toString(36);
const PAIN = "You reported pain. Training suggestions are paused. Please consider speaking to a qualified professional before continuing.";

async function signUp(page: Page, name: string) {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Date of birth").fill("1993-05-06");
  await page.getByLabel("Email").fill(`${name.toLowerCase().replace(/\W/g, "")}-${run}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/pickup$/);
}

async function logSet(page: Page, reps: string, load: string, rpe: string) {
  await page.getByLabel("Reps", { exact: true }).fill(reps);
  await page.getByLabel("Weight (kg)", { exact: true }).fill(load);
  await page.getByLabel("RPE (1–10)", { exact: true }).fill(rpe);
  await page.getByRole("button", { name: "Add set" }).click();
}
const status = (p: Page) => p.locator("main").getByRole("status").first();

test("train: log a workout (including offline), see suggestions, history with sample size, pain pause, and privacy", async ({ page, context, browser }) => {
  await signUp(page, "Tia Trainer");
  await page.goto("/train");
  await expect(page.getByText("No workouts yet.")).toBeVisible();

  // Workout 1: two sets online, one set while offline.
  await page.getByRole("button", { name: "Start a workout" }).click();
  await expect(page).toHaveURL(/\/train\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Workout", exact: true })).toBeVisible();
  const firstWorkoutUrl = page.url();
  await page.getByLabel("Exercise").selectOption({ label: "Back squat" });
  await expect(page.getByText("Awaiting expert review", { exact: false })).toBeVisible();
  await logSet(page, "8", "60", "7");
  await expect(page.getByRole("listitem").filter({ hasText: "8 reps × 60 kg @ RPE 7" })).toHaveCount(1);
  await logSet(page, "8", "60", "7");
  await expect(page.getByRole("listitem").filter({ hasText: "8 reps × 60 kg @ RPE 7" })).toHaveCount(2);

  await context.setOffline(true);
  await logSet(page, "8", "60", "7");
  await expect(page.getByText("(waiting to send)")).toBeVisible();
  await expect(status(page)).toContainText("1 waiting to send");
  await context.setOffline(false);
  await expect(page.getByText("(waiting to send)")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("listitem").filter({ hasText: "8 reps × 60 kg @ RPE 7" })).toHaveCount(3);

  // The set that was entered offline was stored once, not twice.
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "8 reps × 60 kg @ RPE 7" })).toHaveCount(3);

  await page.getByLabel(/How hard was the whole workout/).selectOption("7");
  await page.getByRole("button", { name: "Finish workout" }).click();
  await expect(page).toHaveURL(/\/train$/);
  await expect(page.getByLabel("Recent workouts")).toContainText("3 sets");

  // Workout 2: after one workout there is no suggestion yet; after two good ones there is.
  await page.getByRole("button", { name: "Start a workout" }).click();
  await page.getByLabel("Exercise").selectOption({ label: "Back squat" });
  await expect(page.getByLabel("Suggestion")).toContainText("at least 2 workouts");
  await logSet(page, "8", "60", "7");
  await expect(page.getByRole("listitem").filter({ hasText: "8 reps × 60 kg @ RPE 7" })).toHaveCount(1);
  await page.getByRole("button", { name: "Finish workout" }).click();
  await expect(page).toHaveURL(/\/train$/);

  await page.getByRole("button", { name: "Start a workout" }).click();
  await expect(page).toHaveURL(/\/train\/[0-9a-f-]{36}$/);
  await page.getByLabel("Exercise").selectOption({ label: "Back squat" });
  await expect(page.getByLabel("Suggestion")).toContainText("try 61.25 kg");
  const thirdWorkoutUrl = page.url();

  // History shows the sample size.
  await page.goto("/train/history");
  await page.getByLabel("Exercise").selectOption({ label: "Back squat" });
  await expect(status(page)).toContainText("Based on 2 workouts");
  await expect(page.getByRole("row")).toHaveCount(3); // header + 2 workouts

  // Pain report: suggestions pause, with calm wording and no diagnosis.
  await page.goto("/train");
  await page.getByRole("button", { name: "Check in" }).click();
  await page.getByLabel(/I have pain or something feels unstable/).check();
  await page.getByLabel(/What are you feeling/).fill("left knee");
  await page.getByRole("button", { name: "Save check-in" }).click();
  await expect(page.getByLabel("How are you feeling").getByRole("alert")).toHaveText(PAIN);
  await page.goto(thirdWorkoutUrl);
  await page.getByLabel("Exercise").selectOption({ label: "Back squat" });
  await expect(page.getByLabel("Suggestion")).toContainText("paused");
  await expect(page.getByLabel("Suggestion")).not.toContainText("try 61.25");
  await expect(page.locator("body")).not.toContainText(/injur|diagnos/i);

  // Privacy: another account cannot open this person's workout.
  const other = await (await browser.newContext()).newPage();
  await signUp(other, "Otto Other");
  await other.goto(firstWorkoutUrl);
  await expect(other.getByText("This workout doesn't exist.")).toBeVisible();
  await other.goto("/train");
  await expect(other.getByText("No workouts yet.")).toBeVisible();
});

test("train: signed-out visitors are asked to log in", async ({ page }) => {
  await page.goto("/train");
  await expect(page.getByText(/Your training data is private to you/)).toBeVisible();
});

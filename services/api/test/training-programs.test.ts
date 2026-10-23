import { describe, expect, it } from "vitest";
import { testApp, user } from "./helpers.js";
import { roleAssignments, teams } from "../src/db/schema.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = { id: string; cookie: string };

const post = (t: T, u: U | null, url: string, payload?: unknown) =>
  t.app.inject({
    method: "POST",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
    ...(payload ? { payload: payload as object } : {}),
  });

const get = (t: T, u: U | null, url: string) =>
  t.app.inject({
    method: "GET",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

describe("training programs and periodization API (WP-6.1)", () => {
  it("lists seeded basketball periodization templates flagged awaiting expert review", async () => {
    const t = await testApp();
    const athlete = await user(t, "athlete-prog@courtiq.test");

    const res = await get(t, athlete, "/api/v1/training/programs");
    expect(res.statusCode).toBe(200);
    const programs = res.json().items;
    expect(programs.length).toBeGreaterThanOrEqual(4);

    // Verify all seeded templates have reviewed=false per ADR-0009
    expect(programs.every((p: { reviewed: boolean }) => p.reviewed === false)).toBe(true);

    const offSeason = programs.find((p: { slug: string }) => p.slug === "8-week-off-season-vertical-power");
    expect(offSeason).toBeDefined();
    expect(offSeason.phase).toBe("OFF_SEASON");
    expect(offSeason.primaryGoal).toBe("VERTICAL_POWER");
    expect(offSeason.durationWeeks).toBe(8);
    expect(offSeason.daysPerWeek).toBe(3);

    // Filter by phase
    const inSeasonRes = await get(t, athlete, "/api/v1/training/programs?phase=IN_SEASON");
    expect(inSeasonRes.statusCode).toBe(200);
    expect(inSeasonRes.json().items.every((p: { phase: string }) => p.phase === "IN_SEASON")).toBe(true);
  });

  it("fetches program details with scheduled workout days and exercise prescriptions", async () => {
    const t = await testApp();
    const athlete = await user(t, "athlete-prog2@courtiq.test");

    const listRes = await get(t, athlete, "/api/v1/training/programs");
    const offSeason = listRes.json().items.find((p: { slug: string }) => p.slug === "8-week-off-season-vertical-power");

    const detailRes = await get(t, athlete, `/api/v1/training/programs/${offSeason.id}`);
    expect(detailRes.statusCode).toBe(200);
    const program = detailRes.json();
    expect(program.workouts.length).toBeGreaterThanOrEqual(3);

    const day1 = program.workouts.find((w: { dayNumber: number }) => w.dayNumber === 1);
    expect(day1.title).toContain("Maximal Force & Vertical Launch");
    expect(day1.focus).toBe("LOWER_BODY_FORCE");
    expect(day1.exercisesPrescription.length).toBeGreaterThan(0);
    expect(day1.exercisesPrescription[0].exerciseSlug).toBe("trap-bar-deadlift");
    expect(day1.exercisesPrescription[0].targetSets).toBe(4);
  });

  it("allows athlete to enroll in a program, complete prescribed workouts, and track adherence", async () => {
    const t = await testApp();
    const athlete = await user(t, "athlete-prog3@courtiq.test");

    const listRes = await get(t, athlete, "/api/v1/training/programs");
    const offSeason = listRes.json().items.find((p: { slug: string }) => p.slug === "8-week-off-season-vertical-power");

    // Enroll
    const enrollRes = await post(t, athlete, `/api/v1/training/programs/${offSeason.id}/enroll`, {
      startDate: "2026-10-24",
      notes: "Starting off-season vertical power cycle",
    });
    expect(enrollRes.statusCode).toBe(201);
    const enrollment = enrollRes.json();
    expect(enrollment.id).toBeDefined();
    expect(enrollment.status).toBe("ACTIVE");

    // List enrollments
    const myEnrollments = await get(t, athlete, "/api/v1/training/enrollments");
    expect(myEnrollments.statusCode).toBe(200);
    expect(myEnrollments.json().items.length).toBe(1);
    expect(myEnrollments.json().items[0].adherencePercent).toBe(0);

    // Get enrollment details
    const detailRes = await get(t, athlete, `/api/v1/training/enrollments/${enrollment.id}`);
    expect(detailRes.statusCode).toBe(200);
    const detail = detailRes.json();
    expect(detail.workouts.length).toBeGreaterThan(0);
    expect(detail.painReportedRecently).toBe(false);

    // Complete first workout
    const firstWorkout = detail.workouts[0];
    const compRes = await post(t, athlete, `/api/v1/training/enrollments/${enrollment.id}/complete-workout`, {
      workoutId: firstWorkout.id,
    });
    expect(compRes.statusCode).toBe(200);
    expect(compRes.json().completedWorkoutIds).toContain(firstWorkout.id);

    // Verify adherence recalculated
    const updatedRes = await get(t, athlete, `/api/v1/training/enrollments/${enrollment.id}`);
    expect(updatedRes.json().completedCount).toBe(1);
    expect(updatedRes.json().adherencePercent).toBeGreaterThan(0);
  });

  it("enforces negative authorization (RFC 9457 404) for unauthorized users", async () => {
    const t = await testApp();
    const athlete = await user(t, "athlete-prog4@courtiq.test");
    const stranger = await user(t, "stranger-prog@courtiq.test");

    const listRes = await get(t, athlete, "/api/v1/training/programs");
    const program = listRes.json().items[0];

    // Athlete enrolls
    const enrollRes = await post(t, athlete, `/api/v1/training/programs/${program.id}/enroll`, {});
    const enrollmentId = enrollRes.json().id;

    // Stranger tries to inspect athlete's enrollment -> 404
    const strangerRes = await get(t, stranger, `/api/v1/training/enrollments/${enrollmentId}`);
    expect(strangerRes.statusCode).toBe(404);

    // Stranger tries to list athlete's enrollments -> 404
    const strangerList = await get(t, stranger, `/api/v1/training/enrollments?athleteId=${athlete.id}`);
    expect(strangerList.statusCode).toBe(404);
  });

  it("permits team coaches to create team programs, add workout days, and assign to squad athletes", async () => {
    const t = await testApp();
    const coachUser = await user(t, "coach-prog@courtiq.test");
    const squadPlayer = await user(t, "player-prog@courtiq.test");

    // Coach creates team
    const [team] = await t.db
      .insert(teams)
      .values({
        name: "Lakeside Academy",
        createdBy: coachUser.id,
      })
      .returning();

    // Assign player to team
    await t.db.insert(roleAssignments).values({
      userId: squadPlayer.id,
      resourceType: "team",
      resourceId: team!.id,
      role: "PLAYER",
    });

    // Coach creates custom team program
    const createRes = await post(t, coachUser, "/api/v1/training/programs", {
      name: "Lakeside In-Season Primer",
      phase: "IN_SEASON",
      description: "Custom in-season power maintenance for varsity roster.",
      durationWeeks: 4,
      daysPerWeek: 2,
      primaryGoal: "FATIGUE_MANAGEMENT",
      teamId: team!.id,
    });
    expect(createRes.statusCode).toBe(201);
    const customProg = createRes.json();
    expect(customProg.id).toBeDefined();

    // Coach adds a workout day
    const workoutRes = await post(t, coachUser, `/api/v1/training/programs/${customProg.id}/workouts`, {
      weekNumber: 1,
      dayNumber: 1,
      title: "Game Day Minus 2 Velocity Primer",
      focus: "ELASTIC_VELOCITY",
      estimatedDurationMin: 35,
      exercisesPrescription: [
        {
          exerciseSlug: "countermovement-jump",
          exerciseName: "Countermovement Jump",
          orderIndex: 1,
          targetSets: 3,
          targetReps: 4,
          targetRpe: 6,
          restSeconds: 90,
        },
      ],
    });
    expect(workoutRes.statusCode).toBe(201);

    // Coach assigns program to squad player
    const assignRes = await post(t, coachUser, `/api/v1/training/programs/${customProg.id}/enroll`, {
      athleteId: squadPlayer.id,
      startDate: "2026-10-25",
    });
    expect(assignRes.statusCode).toBe(201);
    expect(assignRes.json().athleteId).toBe(squadPlayer.id);

    // Coach can inspect squad player's enrollment
    const squadEnrollRes = await get(t, coachUser, `/api/v1/training/enrollments/${assignRes.json().id}`);
    expect(squadEnrollRes.statusCode).toBe(200);
    expect(squadEnrollRes.json().program.name).toBe("Lakeside In-Season Primer");
  });

  it("integrates with wellness checks to flag pain safety stop (ADR-0009)", async () => {
    const t = await testApp();
    const athlete = await user(t, "athlete-prog-pain@courtiq.test");

    const listRes = await get(t, athlete, "/api/v1/training/programs");
    const program = listRes.json().items[0];

    const enrollRes = await post(t, athlete, `/api/v1/training/programs/${program.id}/enroll`, {});
    const enrollmentId = enrollRes.json().id;

    // Initially no pain reported
    const check1 = await get(t, athlete, `/api/v1/training/enrollments/${enrollmentId}`);
    expect(check1.json().painReportedRecently).toBe(false);

    // Athlete reports pain in wellness check
    await post(t, athlete, "/api/v1/training/wellness", {
      date: new Date().toISOString().split("T")[0],
      painReported: true,
      painNote: "Mild anterior knee pain after heavy landing",
    });

    // Enrollment now flags painReportedRecently = true
    const check2 = await get(t, athlete, `/api/v1/training/enrollments/${enrollmentId}`);
    expect(check2.json().painReportedRecently).toBe(true);
  });
});

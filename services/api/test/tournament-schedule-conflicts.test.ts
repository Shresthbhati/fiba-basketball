import { describe, expect, it } from "vitest";
import {
  autoScheduleTournament,
  validateScheduleConflicts,
  type SchedulableMatch,
} from "../src/competition/schedule.js";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = { id: string; cookie: string };

const post = (t: T, u: U, url: string, payload?: unknown) =>
  t.app.inject({
    method: "POST",
    url,
    headers: { cookie: u.cookie },
    ...(payload ? { payload } : {}),
  });

const patch = (t: T, u: U, url: string, payload?: unknown) =>
  t.app.inject({
    method: "PATCH",
    url,
    headers: { cookie: u.cookie },
    ...(payload ? { payload } : {}),
  });

const get = (t: T, url: string, u?: U) =>
  t.app.inject({ url, ...(u ? { headers: { cookie: u.cookie } } : {}) });

describe("Tournament Multi-Court Constraint Engine & Schedule Conflict Detector (Spec §10.2, §17.1)", () => {
  it("pure engine detects court overlap, double-booked team, rest violations, and venue hours", () => {
    const baseTime = new Date("2026-11-01T10:00:00Z").getTime();

    // 1. Court Overlap test:
    // Match 1 on Court 1: 10:00 - 11:00
    // Match 2 on Court 1: 10:30 - 11:30 (Overlap!)
    const overlapMatches: SchedulableMatch[] = [
      {
        id: "m1",
        homeTeamId: "team-A",
        awayTeamId: "team-B",
        courtName: "Court 1",
        scheduledAt: new Date(baseTime).toISOString(),
        estimatedDurationMinutes: 60,
      },
      {
        id: "m2",
        homeTeamId: "team-C",
        awayTeamId: "team-D",
        courtName: "Court 1",
        scheduledAt: new Date(baseTime + 30 * 60 * 1000).toISOString(),
        estimatedDurationMinutes: 60,
      },
    ];

    const res1 = validateScheduleConflicts(overlapMatches);
    expect(res1.valid).toBe(false);
    expect(res1.conflicts).toHaveLength(1);
    expect(res1.conflicts[0]!.type).toBe("COURT_OVERLAP");
    expect(res1.conflicts[0]!.severity).toBe("ERROR");
    expect(res1.conflicts[0]!.courtName).toBe("Court 1");

    // 2. Double-Booked Team test:
    // Team A playing on Court 1 at 10:00 - 11:00
    // Team A also playing on Court 2 at 10:30 - 11:30
    const doubleBookedMatches: SchedulableMatch[] = [
      {
        id: "m1",
        homeTeamId: "team-A",
        awayTeamId: "team-B",
        courtName: "Court 1",
        scheduledAt: new Date(baseTime).toISOString(),
        estimatedDurationMinutes: 60,
      },
      {
        id: "m2",
        homeTeamId: "team-A",
        awayTeamId: "team-C",
        courtName: "Court 2",
        scheduledAt: new Date(baseTime + 30 * 60 * 1000).toISOString(),
        estimatedDurationMinutes: 60,
      },
    ];

    const res2 = validateScheduleConflicts(doubleBookedMatches);
    expect(res2.valid).toBe(false);
    expect(res2.conflicts.some((c) => c.type === "DOUBLE_BOOKED_TEAM")).toBe(true);

    // 3. Team Rest Violation test:
    // Match 1: 10:00 - 11:00 (ends 11:00)
    // Match 2: 11:20 - 12:20 (gap is only 20 mins, below required 60m min rest)
    const restViolationMatches: SchedulableMatch[] = [
      {
        id: "m1",
        homeTeamId: "team-A",
        awayTeamId: "team-B",
        courtName: "Court 1",
        scheduledAt: new Date(baseTime).toISOString(),
        estimatedDurationMinutes: 60,
      },
      {
        id: "m2",
        homeTeamId: "team-A",
        awayTeamId: "team-C",
        courtName: "Court 2",
        scheduledAt: new Date(baseTime + 80 * 60 * 1000).toISOString(),
        estimatedDurationMinutes: 60,
      },
    ];

    const res3 = validateScheduleConflicts(restViolationMatches, { minRestMinutes: 60 });
    expect(res3.conflicts.some((c) => c.type === "TEAM_REST_VIOLATION")).toBe(true);

    // 4. Clean non-conflicting schedule
    const cleanMatches: SchedulableMatch[] = [
      {
        id: "m1",
        homeTeamId: "team-A",
        awayTeamId: "team-B",
        courtName: "Court 1",
        scheduledAt: new Date(baseTime).toISOString(),
        estimatedDurationMinutes: 60,
      },
      {
        id: "m2",
        homeTeamId: "team-C",
        awayTeamId: "team-D",
        courtName: "Court 2",
        scheduledAt: new Date(baseTime).toISOString(),
        estimatedDurationMinutes: 60,
      },
      {
        id: "m3",
        homeTeamId: "team-A",
        awayTeamId: "team-C",
        courtName: "Court 1",
        scheduledAt: new Date(baseTime + 135 * 60 * 1000).toISOString(), // 75m rest after 11:00
        estimatedDurationMinutes: 60,
      },
    ];

    const res4 = validateScheduleConflicts(cleanMatches, { minRestMinutes: 60 });
    expect(res4.valid).toBe(true);
    expect(res4.conflicts).toHaveLength(0);
  });

  it("autoScheduleTournament distributes matches across multiple courts with zero conflicts", () => {
    // 6 round-robin matches for 4 teams
    const matches: SchedulableMatch[] = [
      { id: "m1", round: 1, slot: 1, homeTeamId: "t1", awayTeamId: "t2" },
      { id: "m2", round: 1, slot: 2, homeTeamId: "t3", awayTeamId: "t4" },
      { id: "m3", round: 2, slot: 1, homeTeamId: "t1", awayTeamId: "t3" },
      { id: "m4", round: 2, slot: 2, homeTeamId: "t4", awayTeamId: "t2" },
      { id: "m5", round: 3, slot: 1, homeTeamId: "t1", awayTeamId: "t4" },
      { id: "m6", round: 3, slot: 2, homeTeamId: "t2", awayTeamId: "t3" },
    ];

    const scheduled = autoScheduleTournament(matches, {
      availableCourts: ["Court 1", "Court 2"],
      startDateTime: "2026-11-01T09:00:00Z",
      matchDurationMinutes: 60,
      bufferMinutes: 15,
      minRestMinutes: 60,
      dailyStartHour: 9,
      dailyEndHour: 21,
    });

    expect(scheduled.assignments).toHaveLength(6);
    expect(scheduled.validation.valid).toBe(true);
    expect(scheduled.validation.conflictCount).toBe(0);

    // Verify Court 1 and Court 2 were both utilized
    const courtsUsed = new Set(scheduled.assignments.map((a) => a.courtName));
    expect(courtsUsed.has("Court 1")).toBe(true);
    expect(courtsUsed.has("Court 2")).toBe(true);
  });

  it("integrates with competition API: auto-assign, patch schedule, and negative authZ", async () => {
    const t = await testApp();
    const organizer = await user(t, "organizer@example.com");
    const otherUser = await user(t, "other@example.com");

    // Create tournament with 3 teams
    const compRes = await post(t, organizer, "/api/v1/competitions", {
      name: "Championship Invitational",
      format: "ROUND_ROBIN",
    });
    const comp = compRes.json();

    const t1 = (await post(t, organizer, "/api/v1/teams", { name: "Warriors" })).json();
    const t2 = (await post(t, organizer, "/api/v1/teams", { name: "Lakers" })).json();
    const t3 = (await post(t, organizer, "/api/v1/teams", { name: "Celtics" })).json();

    await post(t, organizer, `/api/v1/competitions/${comp.id}/teams`, { teamId: t1.id, seed: 1 });
    await post(t, organizer, `/api/v1/competitions/${comp.id}/teams`, { teamId: t2.id, seed: 2 });
    await post(t, organizer, `/api/v1/competitions/${comp.id}/teams`, { teamId: t3.id, seed: 3 });

    // Generate schedule
    const schedRes = await post(t, organizer, `/api/v1/competitions/${comp.id}/schedule`);
    expect(schedRes.statusCode).toBe(201);
    const ms = schedRes.json().items;
    expect(ms).toHaveLength(3);

    // Negative authZ check: unauthorized user cannot trigger auto-assign (ADR-0010 404)
    const unauthorizedAutoAssign = await post(
      t,
      otherUser,
      `/api/v1/competitions/${comp.id}/schedule/auto-assign`,
      {
        availableCourts: ["Court 1", "Court 2"],
        startDateTime: "2026-11-01T10:00:00Z",
      }
    );
    expect(unauthorizedAutoAssign.statusCode).toBe(404);

    // Organizer triggers auto-assign
    const autoAssignRes = await post(
      t,
      organizer,
      `/api/v1/competitions/${comp.id}/schedule/auto-assign`,
      {
        availableCourts: ["Court 1", "Court 2"],
        startDateTime: "2026-11-01T10:00:00Z",
        matchDurationMinutes: 60,
        bufferMinutes: 15,
        minRestMinutes: 60,
      }
    );
    expect(autoAssignRes.statusCode).toBe(200);
    const assignData = autoAssignRes.json();
    expect(assignData.assignments).toHaveLength(3);
    expect(assignData.validation.valid).toBe(true);

    // Verify match in DB now has courtName and scheduledAt
    const match1 = (await get(t, `/api/v1/matches/${ms[0].id}`, organizer)).json();
    expect(match1.courtName).toBeDefined();
    expect(match1.scheduledAt).toBeDefined();
    expect(match1.estimatedDurationMinutes).toBe(60);

    // Organizer manually updates match court and duration via PATCH
    const patchRes = await patch(t, organizer, `/api/v1/matches/${ms[0].id}`, {
      courtName: "Championship Main Arena",
      estimatedDurationMinutes: 75,
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().courtName).toBe("Championship Main Arena");
    expect(patchRes.json().estimatedDurationMinutes).toBe(75);

    // Check conflicts endpoint
    const conflictsRes = await get(
      t,
      `/api/v1/competitions/${comp.id}/schedule/conflicts`,
      organizer
    );
    expect(conflictsRes.statusCode).toBe(200);
    expect(conflictsRes.json().valid).toBe(true);

    // Verify command center receives conflict count and detected warning
    const ccRes = await get(t, `/api/v1/competitions/${comp.id}/command-center`, organizer);
    expect(ccRes.statusCode).toBe(200);
    expect(ccRes.json().summary.conflictCount).toBe(1);
    expect(ccRes.json().conflicts[0].type).toBe("TEAM_REST_VIOLATION");
    expect(ccRes.json().matches[0].courtName).toBe("Championship Main Arena");
  });
});

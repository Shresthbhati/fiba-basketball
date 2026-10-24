import { describe, expect, it } from "vitest";
import { testApp, user } from "./helpers.js";
import { grantRole } from "../src/authz/service.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = Awaited<ReturnType<typeof user>>;

const post = (t: T, u: U | null, url: string, body?: unknown) =>
  t.app.inject({
    method: "POST",
    url,
    payload: body ?? {},
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

const get = (t: T, u: U | null, url: string) =>
  t.app.inject({
    method: "GET",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

describe("Referee Workspace & Match Sign-off Protocol (Spec §23.2, §16.4)", { timeout: 30000 }, () => {
  it("manages assigned matches, pregame safety checklist, incident reports, and official sign-off locking matches", async () => {
    const t = await testApp();
    const organizer = await user(t, "organizer-ref-test@courtiq.test", { displayName: "Tourney Director" });
    const referee = await user(t, "official-ref@courtiq.test", { displayName: "Referee Dave" });
    const stranger = await user(t, "stranger-ref@courtiq.test", { displayName: "Spectator Sam" });

    // 1. Create competition and teams
    const compRes = await post(t, organizer, "/api/v1/competitions", {
      name: "Metropolitan Championship 2026",
      format: "ROUND_ROBIN",
    });
    expect(compRes.statusCode).toBe(201);
    const compId = compRes.json().id;

    const t1 = await post(t, organizer, "/api/v1/teams", { name: "Harlem Hawks" });
    const t2 = await post(t, organizer, "/api/v1/teams", { name: "Queens Knights" });
    const team1Id = t1.json().id;
    const team2Id = t2.json().id;

    await post(t, organizer, `/api/v1/competitions/${compId}/teams`, { teamId: team1Id });
    await post(t, organizer, `/api/v1/competitions/${compId}/teams`, { teamId: team2Id });

    // 2. Generate schedule
    const schedRes = await post(t, organizer, `/api/v1/competitions/${compId}/schedule`);
    expect(schedRes.statusCode).toBe(201);

    // 3. Assign referee to competition
    await grantRole(t.db, referee.id, "REFEREE", { type: "competition", id: compId });

    // 4. Referee views assigned matches
    const myMatches = await get(t, referee, "/api/v1/referee/matches");
    expect(myMatches.statusCode).toBe(200);
    const matchesList = myMatches.json().items;
    expect(matchesList.length).toBeGreaterThanOrEqual(1);
    const matchId = matchesList[0].id;
    expect(matchesList[0].pregameCompleted).toBe(false);
    expect(matchesList[0].signedOff).toBe(false);

    // 5. Unauthorized stranger attempts to inspect pregame -> 404 (ADR-0010)
    const strangerPregame = await get(t, stranger, `/api/v1/matches/${matchId}/pregame`);
    expect(strangerPregame.statusCode).toBe(404);

    // 6. Referee completes pre-game safety checklist
    const pregameRes = await post(t, referee, `/api/v1/matches/${matchId}/pregame`, {
      courtSurfaceSafe: true,
      perimeterRunoffClear: true,
      gameBallPressureChecked: true,
      gameClockTested: true,
      shotClockTested: true,
      jerseyContrastVerified: true,
      tableCrewConfirmed: true,
      notes: "Court inspected, 2.0m runoff clear, Molten BG5000 ball pressure 0.60 bar.",
    });
    expect(pregameRes.statusCode).toBe(200);
    expect(pregameRes.json().courtSurfaceSafe).toBe(true);

    // 7. Referee records disciplinary incident during match
    const incidentRes = await post(t, referee, `/api/v1/matches/${matchId}/incidents`, {
      incidentType: "TECHNICAL_FOUL",
      teamId: team1Id,
      period: 2,
      gameClockTime: "04:30",
      description: "Coach bench received technical foul for continuous dissent on no-call.",
      ruleReference: "FIBA Rule 36 (Technical Foul)",
    });
    expect(incidentRes.statusCode).toBe(201);
    expect(incidentRes.json().incidentType).toBe("TECHNICAL_FOUL");

    // List incident reports
    const incidents = await get(t, referee, `/api/v1/matches/${matchId}/incidents`);
    expect(incidents.statusCode).toBe(200);
    expect(incidents.json().items.length).toBe(1);

    // 8. Referee attempts to sign off when match is SCHEDULED -> 400 Bad Request
    const prematureSignoff = await post(t, referee, `/api/v1/matches/${matchId}/signoff`, {
      isCrewChief: true,
      finalScoreVerified: true,
    });
    expect(prematureSignoff.statusCode).toBe(400);

    // 9. Organizer / Scorekeeper records final score -> state becomes FINISHED
    const scoreRes = await post(t, organizer, `/api/v1/matches/${matchId}/result`, {
      homeScore: 84,
      awayScore: 78,
    });
    expect(scoreRes.statusCode).toBe(200);
    expect(scoreRes.json().state).toBe("FINISHED");

    // 10. Referee officially signs off and locks the match
    const signoffRes = await post(t, referee, `/api/v1/matches/${matchId}/signoff`, {
      isCrewChief: true,
      finalScoreVerified: true,
      scorebookAudited: true,
      refereeNotes: "Official FIBA scoresheet verified and signed by crew chief Dave.",
    });
    expect(signoffRes.statusCode).toBe(200);
    expect(signoffRes.json().signoff.isCrewChief).toBe(true);
    expect(signoffRes.json().match.state).toBe("LOCKED");

    // 11. Refreshed assigned matches list reflects completed pregame and signoff
    const updatedMatches = await get(t, referee, "/api/v1/referee/matches");
    const updatedTarget = updatedMatches.json().items.find((m: { id: string }) => m.id === matchId);
    expect(updatedTarget.pregameCompleted).toBe(true);
    expect(updatedTarget.signedOff).toBe(true);
    expect(updatedTarget.state).toBe("LOCKED");
  });
});

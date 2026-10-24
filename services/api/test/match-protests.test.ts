import { describe, expect, it } from "vitest";
import { grantRole } from "../src/authz/service.js";
import { testApp, user } from "./helpers.js";

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

describe("Match Protest & Dispute Resolution Tribunal OS (Spec §8.2, §16.5)", { timeout: 30000 }, () => {
  it("manages official protest filing, tribunal adjudication, referee testimony, and atomic score/standings adjustments", async () => {
    const t = await testApp();
    const organizer = await user(t, "director@tribunal.test", { displayName: "Tourney Director" });
    const coachHawks = await user(t, "coach-hawks@teams.test", { displayName: "Coach Miller" });
    const stranger = await user(t, "stranger@other.test", { displayName: "Stranger Bob" });

    // 1. Create competition and teams
    const compRes = await post(t, organizer, "/api/v1/competitions", {
      name: "FIBA Regional Invitational 2026",
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

    // Grant coach role on Harlem Hawks
    await grantRole(t.db, coachHawks.id, "COACH", { type: "team", id: team1Id });

    // 2. Schedule match
    const schedRes = await post(t, organizer, `/api/v1/competitions/${compId}/schedule`);
    expect(schedRes.statusCode).toBe(201);

    const matchesList = await get(t, organizer, `/api/v1/competitions/${compId}/matches`);
    const matchId = matchesList.json().items[0].id;

    // 3. Complete match: Initial score Hawks 80, Knights 82
    const { recordResult } = await import("../src/competition/service.js");
    await recordResult(t.db, matchId, organizer.id, {
      homeScore: 80,
      awayScore: 82,
    });

    // Initial standings: Knights in 1st place
    const initStandings = await get(t, null, `/api/v1/competitions/${compId}/standings`);
    expect(initStandings.json().items[0].name).toBe("Queens Knights");

    // 4. File official protest by Coach Miller (Harlem Hawks)
    // Stranger attempting to file protest gets 404 (ADR-0010 negative authZ)
    const badProtest = await post(t, stranger, `/api/v1/matches/${matchId}/protests`, {
      filingTeamId: team1Id,
      protestType: "SCORE_DISCREPANCY",
      description: "Trying to file unauthorized protest",
    });
    expect(badProtest.statusCode).toBe(404);

    const protestRes = await post(t, coachHawks, `/api/v1/matches/${matchId}/protests`, {
      filingTeamId: team1Id,
      protestType: "SCORE_DISCREPANCY",
      period: 4,
      gameClock: "00:14",
      ruleCited: "FIBA Art. 44 (Correctable Errors)",
      description: "Scorer failed to record 2 made free throws by #11 at 00:14 in Q4 following an unsportsmanlike foul.",
    });
    expect(protestRes.statusCode).toBe(201);
    const protest = protestRes.json();
    expect(protest.status).toBe("FILED");
    expect(protest.depositVerified).toBe(true);

    // Duplicate pending protest rejected
    const dupProtest = await post(t, coachHawks, `/api/v1/matches/${matchId}/protests`, {
      filingTeamId: team1Id,
      protestType: "SCORE_DISCREPANCY",
      description: "Duplicate protest",
    });
    expect(dupProtest.statusCode).toBe(400);

    // 5. Public / Match queries list protests
    const matchProtestsRes = await get(t, null, `/api/v1/matches/${matchId}/protests`);
    expect(matchProtestsRes.statusCode).toBe(200);
    expect(matchProtestsRes.json().length).toBe(1);
    expect(matchProtestsRes.json()[0].filingTeamName).toBe("Harlem Hawks");

    // Organizer lists all competition protests
    const compProtestsRes = await get(t, organizer, `/api/v1/competitions/${compId}/protests`);
    expect(compProtestsRes.statusCode).toBe(200);
    expect(compProtestsRes.json().length).toBe(1);

    // Stranger attempting to list competition protests gets 404
    const badCompProtests = await get(t, stranger, `/api/v1/competitions/${compId}/protests`);
    expect(badCompProtests.statusCode).toBe(404);

    // 6. Tournament Disciplinary Tribunal Adjudication
    // Stranger cannot adjudicate protest (returns 404)
    const badAdjudicate = await post(t, stranger, `/api/v1/protests/${protest.id}/adjudicate`, {
      ruling: "UPHELD",
      rulingSummary: "Unauthorized ruling",
    });
    expect(badAdjudicate.statusCode).toBe(404);

    // Organizer / Disciplinary Tribunal upholds protest with score adjustment: Hawks 84, Knights 82
    const rulingRes = await post(t, organizer, `/api/v1/protests/${protest.id}/adjudicate`, {
      ruling: "UPHELD",
      remedyAction: "SCORE_ADJUSTED",
      refereeTestimony: "Crew chief confirms scorebook omitted 2 made free throws by Harlem #11 during period 4.",
      adjustedHomeScore: 84,
      adjustedAwayScore: 82,
      rulingSummary: "Protest upheld pursuant to FIBA Art. 44. Official box score updated to 84-82 in favor of Harlem Hawks.",
    });
    expect(rulingRes.statusCode).toBe(200);
    expect(rulingRes.json().status).toBe("UPHELD");
    expect(rulingRes.json().ruling.remedyAction).toBe("SCORE_ADJUSTED");

    // 7. Verify match score and standings automatically updated!
    const updatedMatch = await get(t, null, `/api/v1/matches/${matchId}`);
    expect(updatedMatch.json().homeScore).toBe(84);
    expect(updatedMatch.json().awayScore).toBe(82);

    const updatedStandings = await get(t, null, `/api/v1/competitions/${compId}/standings`);
    // Harlem Hawks should now be ranked #1
    expect(updatedStandings.json().items[0].name).toBe("Harlem Hawks");
  });
});

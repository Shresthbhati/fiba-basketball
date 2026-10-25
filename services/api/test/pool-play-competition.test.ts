import { describe, expect, it } from "vitest";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = { id: string; cookie: string };

const post = (t: T, u: U, url: string, payload?: unknown) =>
  t.app.inject({ method: "POST", url, headers: { cookie: u.cookie }, ...(payload ? { payload } : {}) });
const get = (t: T, url: string, u?: U) =>
  t.app.inject({ url, ...(u ? { headers: { cookie: u.cookie } } : {}) });
const patch = (t: T, u: U, url: string, payload?: unknown) =>
  t.app.inject({ method: "PATCH", url, headers: { cookie: u.cookie }, ...(payload ? { payload } : {}) });

describe("Pool Play to Playoffs (GROUPS_TO_PLAYOFFS) Competition (Spec §10.1, §10.2, WP-1.7)", () => {
  it("enforces negative authZ on organizer actions (ADR-0010: RFC 9457 404)", async () => {
    const t = await testApp();
    const organizer = await user(t, "org-pool@courtiq.test");
    const outsider = await user(t, "outsider@courtiq.test");

    const compRes = await post(t, organizer, "/api/v1/competitions", {
      name: "FIBA 3x3 World Showcase",
      format: "GROUPS_TO_PLAYOFFS",
      groupCount: 2,
      advancePerGroup: 2,
    });
    expect(compRes.statusCode).toBe(201);
    const comp = compRes.json();

    const team1Res = await post(t, organizer, "/api/v1/teams", { name: "Team USA" });
    const team1 = team1Res.json();

    // Outsider tries to register a team or generate schedule -> 404 Not Found
    const badReg = await post(t, outsider, `/api/v1/competitions/${comp.id}/teams`, {
      teamId: team1.id,
      seed: 1,
    });
    expect(badReg.statusCode).toBe(404);

    const badSched = await post(t, outsider, `/api/v1/competitions/${comp.id}/schedule`);
    expect(badSched.statusCode).toBe(404);

    // Outsider tries to adjust team group -> 404 Not Found
    const badGroup = await patch(t, outsider, `/api/v1/competitions/${comp.id}/teams/${team1.id}/group`, {
      groupName: "Group Z",
    });
    expect(badGroup.statusCode).toBe(404);
  });

  it("manages 2-group pool play, generates group & playoff fixtures, auto-advances qualifiers and completes tournament", async () => {
    const t = await testApp();
    const org = await user(t, "fiba-director@courtiq.test");

    // 1. Create GROUPS_TO_PLAYOFFS competition
    const compRes = await post(t, org, "/api/v1/competitions", {
      name: "Athens Invitational Pool Play",
      format: "GROUPS_TO_PLAYOFFS",
      groupCount: 2,
      advancePerGroup: 2,
    });
    expect(compRes.statusCode).toBe(201);
    const comp = compRes.json();
    expect(comp.format).toBe("GROUPS_TO_PLAYOFFS");
    expect(comp.groupCount).toBe(2);
    expect(comp.advancePerGroup).toBe(2);

    // 2. Register 6 teams (3 per pool):
    // Seed 1: Eagles (Group A via snake)
    // Seed 2: Hawks  (Group B via snake)
    // Seed 3: Lions  (Group B via snake)
    // Seed 4: Tigers (Group A via snake)
    // Seed 5: Bears  (Group A via snake)
    // Seed 6: Wolves (Group B via snake)
    const teamNames = ["Eagles", "Hawks", "Lions", "Tigers", "Bears", "Wolves"];
    const teamMap: Record<string, string> = {};
    const teamIds: string[] = [];

    for (let i = 0; i < teamNames.length; i++) {
      const name = teamNames[i]!;
      const tRes = await post(t, org, "/api/v1/teams", { name });
      const team = tRes.json();
      teamMap[name] = team.id;
      teamIds.push(team.id);
      const regRes = await post(t, org, `/api/v1/competitions/${comp.id}/teams`, {
        teamId: team.id,
        seed: i + 1,
      });
      expect(regRes.statusCode).toBe(201);
    }

    // 3. Generate Schedule
    const schedRes = await post(t, org, `/api/v1/competitions/${comp.id}/schedule`);
    expect(schedRes.statusCode).toBe(201);
    const allMatches = schedRes.json().items;

    // 3 teams per group: each group has 3 matches (total 6 group matches)
    const groupMatches = allMatches.filter((m: { stage: string }) => m.stage === "GROUP");
    expect(groupMatches).toHaveLength(6);

    const groupAMatches = groupMatches.filter((m: { groupName: string }) => m.groupName === "Group A");
    const groupBMatches = groupMatches.filter((m: { groupName: string }) => m.groupName === "Group B");
    expect(groupAMatches).toHaveLength(3);
    expect(groupBMatches).toHaveLength(3);

    // Playoff bracket: 2 Semifinals (round 1) + 1 Final (round 2) = 3 playoff matches
    const playoffMatches = allMatches.filter((m: { stage: string }) => m.stage === "PLAYOFF");
    expect(playoffMatches).toHaveLength(3);

    const sf1 = playoffMatches.find((m: { round: number; slot: number }) => m.round === 1 && m.slot === 1);
    const sf2 = playoffMatches.find((m: { round: number; slot: number }) => m.round === 1 && m.slot === 2);
    const finalMatch = playoffMatches.find((m: { round: number; slot: number }) => m.round === 2 && m.slot === 1);

    expect(sf1).toBeDefined();
    expect(sf2).toBeDefined();
    expect(finalMatch).toBeDefined();
    expect(sf1.nextMatchId).toBe(finalMatch.id);
    expect(sf2.nextMatchId).toBe(finalMatch.id);

    // Initially, playoff matches have no teams assigned (waiting for pool results)
    expect(sf1.homeTeamId).toBeNull();
    expect(sf1.awayTeamId).toBeNull();
    expect(sf2.homeTeamId).toBeNull();
    expect(sf2.awayTeamId).toBeNull();

    // 4. Verify Group Standings endpoint starts with 0 played
    const standingsRes = await get(t, `/api/v1/competitions/${comp.id}/group-standings`);
    expect(standingsRes.statusCode).toBe(200);
    const initialStandings = standingsRes.json();
    expect(initialStandings["Group A"]).toHaveLength(3);
    expect(initialStandings["Group B"]).toHaveLength(3);
    expect(initialStandings["Group A"][0].played).toBe(0);

    // 5. Play all group matches with deterministic outcomes:
    // Group A (Eagles, Tigers, Bears):
    // - Eagles beat Tigers: 80 - 70
    // - Eagles beat Bears: 85 - 65
    // - Tigers beat Bears: 75 - 72
    // Group A Finish: 1st Eagles (2-0), 2nd Tigers (1-1), 3rd Bears (0-2)
    //
    // Group B (Hawks, Lions, Wolves):
    // - Hawks beat Lions: 90 - 82
    // - Hawks beat Wolves: 88 - 74
    // - Lions beat Wolves: 80 - 75
    // Group B Finish: 1st Hawks (2-0), 2nd Lions (1-1), 3rd Wolves (0-2)

    for (const m of groupAMatches) {
      let homeScore = 70;
      let awayScore = 65;
      if (m.homeTeamId === teamMap["Eagles"]) {
        homeScore = 80;
        awayScore = 70;
      } else if (m.awayTeamId === teamMap["Eagles"]) {
        homeScore = 70;
        awayScore = 80;
      } else if (m.homeTeamId === teamMap["Tigers"]) {
        homeScore = 75;
        awayScore = 70;
      } else if (m.awayTeamId === teamMap["Tigers"]) {
        homeScore = 70;
        awayScore = 75;
      }
      const res = await post(t, org, `/api/v1/matches/${m.id}/result`, { homeScore, awayScore });
      expect(res.statusCode).toBe(200);
    }

    for (const m of groupBMatches) {
      let homeScore = 70;
      let awayScore = 65;
      if (m.homeTeamId === teamMap["Hawks"]) {
        homeScore = 90;
        awayScore = 80;
      } else if (m.awayTeamId === teamMap["Hawks"]) {
        homeScore = 80;
        awayScore = 90;
      } else if (m.homeTeamId === teamMap["Lions"]) {
        homeScore = 80;
        awayScore = 75;
      } else if (m.awayTeamId === teamMap["Lions"]) {
        homeScore = 75;
        awayScore = 80;
      }
      const res = await post(t, org, `/api/v1/matches/${m.id}/result`, { homeScore, awayScore });
      expect(res.statusCode).toBe(200);
    }

    // 6. Verify Group Standings after all group matches complete
    const finalGroupStandings = (await get(t, `/api/v1/competitions/${comp.id}/group-standings`)).json();
    const groupARanks = finalGroupStandings["Group A"].map((r: { name: string }) => r.name);
    const groupBRanks = finalGroupStandings["Group B"].map((r: { name: string }) => r.name);

    expect(groupARanks).toEqual(["Eagles", "Tigers", "Bears"]);
    expect(groupBRanks).toEqual(["Hawks", "Lions", "Wolves"]);

    // 7. Verify Auto-Advancement into Playoff Round 1:
    // SF 1 (slot 1): A1 (Eagles) vs B2 (Lions)
    // SF 2 (slot 2): B1 (Hawks) vs A2 (Tigers)
    const updatedSf1 = (await get(t, `/api/v1/matches/${sf1.id}`)).json();
    const updatedSf2 = (await get(t, `/api/v1/matches/${sf2.id}`)).json();

    expect(updatedSf1.home.id).toBe(teamMap["Eagles"]);
    expect(updatedSf1.away.id).toBe(teamMap["Lions"]);

    expect(updatedSf2.home.id).toBe(teamMap["Hawks"]);
    expect(updatedSf2.away.id).toBe(teamMap["Tigers"]);

    // 8. Play Semifinals:
    // SF1: Eagles beat Lions (92 - 84)
    // SF2: Hawks beat Tigers (89 - 85)
    await post(t, org, `/api/v1/matches/${sf1.id}/result`, { homeScore: 92, awayScore: 84 });
    await post(t, org, `/api/v1/matches/${sf2.id}/result`, { homeScore: 89, awayScore: 85 });

    // 9. Verify Final match populated with winners (Eagles vs Hawks)
    const updatedFinal = (await get(t, `/api/v1/matches/${finalMatch.id}`)).json();
    expect(updatedFinal.home.id).toBe(teamMap["Eagles"]);
    expect(updatedFinal.away.id).toBe(teamMap["Hawks"]);

    // 10. Play Championship Final: Eagles beat Hawks (95 - 91)
    await post(t, org, `/api/v1/matches/${finalMatch.id}/result`, { homeScore: 95, awayScore: 91 });

    // 11. Verify competition status transitions to COMPLETED
    const completedComp = (await get(t, `/api/v1/competitions/${comp.id}`)).json();
    expect(completedComp.status).toBe("COMPLETED");
  });
});

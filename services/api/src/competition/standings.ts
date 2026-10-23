export type Result = { home: string; away: string; homeScore: number; awayScore: number; forfeit?: boolean };
export type Row = {
  team: string; played: number; wins: number; losses: number; points: number; pointsFor: number; pointsAgainst: number; diff: number;
};
export type TieBreaker = "headToHead" | "diff" | "pointsFor";

// FIBA-style table points: win 2, loss 1, forfeit loss 0.
export const TABLE_POINTS = { win: 2, loss: 1, forfeitLoss: 0 };

function table(teams: string[], results: Result[]): Map<string, Row> {
  const rows = new Map<string, Row>(
    teams.map((t) => [t, { team: t, played: 0, wins: 0, losses: 0, points: 0, pointsFor: 0, pointsAgainst: 0, diff: 0 }]),
  );
  for (const r of results) {
    const h = rows.get(r.home), a = rows.get(r.away);
    if (!h || !a) continue;
    const homeWon = r.homeScore > r.awayScore;
    if (r.homeScore === r.awayScore) throw new Error("Basketball results cannot be tied");
    const [w, l] = homeWon ? [h, a] : [a, h];
    for (const [row, f, ag] of [[h, r.homeScore, r.awayScore], [a, r.awayScore, r.homeScore]] as const) {
      row.played++; row.pointsFor += f; row.pointsAgainst += ag; row.diff += f - ag;
    }
    w.wins++; w.points += TABLE_POINTS.win;
    l.losses++; l.points += r.forfeit ? TABLE_POINTS.forfeitLoss : TABLE_POINTS.loss;
  }
  return rows;
}

/**
 * Ranks by table points, then breaks ties in the configured order. Head-to-head is evaluated only among the
 * teams still tied (a mini-table of the games between them). Remaining ties fall back to team id for a stable order.
 */
export function standings(
  teams: string[],
  results: Result[],
  tieBreakers: TieBreaker[] = ["headToHead", "diff", "pointsFor"],
): Row[] {
  const all = table(teams, results);
  const rank = (group: string[], breakers: TieBreaker[]): string[] => {
    if (group.length <= 1) return group;
    if (breakers.length === 0) return [...group].sort();
    const [first, ...rest] = breakers as [TieBreaker, ...TieBreaker[]];
    const key = (t: string): number => {
      if (first === "headToHead") {
        const mini = table(group, results.filter((r) => group.includes(r.home) && group.includes(r.away)));
        return mini.get(t)!.points;
      }
      return first === "diff" ? all.get(t)!.diff : all.get(t)!.pointsFor;
    };
    const buckets = new Map<number, string[]>();
    for (const t of group) buckets.set(key(t), [...(buckets.get(key(t)) ?? []), t]);
    return [...buckets.entries()].sort((x, y) => y[0] - x[0]).flatMap(([, ts]) => {
      // If this breaker separated nobody, don't loop on it again.
      return ts.length === group.length ? rank(ts, rest) : rank(ts, breakers);
    });
  };
  const byPoints = new Map<number, string[]>();
  for (const t of teams) byPoints.set(all.get(t)!.points, [...(byPoints.get(all.get(t)!.points) ?? []), t]);
  return [...byPoints.entries()]
    .sort((x, y) => y[0] - x[0])
    .flatMap(([, ts]) => rank(ts, tieBreakers))
    .map((t) => all.get(t)!);
}

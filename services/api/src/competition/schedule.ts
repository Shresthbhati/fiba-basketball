export type Pairing = { round: number; home: string; away: string };

/** Circle method. Each team plays every other once; odd counts get a bye (no pairing emitted). */
export function roundRobin(teams: string[], opts: { doubleRound?: boolean } = {}): Pairing[] {
  if (new Set(teams).size !== teams.length) throw new Error("Duplicate team ids");
  if (teams.length < 2) return [];
  const ring: (string | null)[] = teams.length % 2 === 0 ? [...teams] : [...teams, null];
  const n = ring.length;
  const out: Pairing[] = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = ring[i]!, b = ring[n - 1 - i]!;
      if (a === null || b === null) continue;
      // Alternate home/away so no team is always home.
      out.push(r % 2 === 0 ? { round: r + 1, home: a, away: b } : { round: r + 1, home: b, away: a });
    }
    ring.splice(1, 0, ring.pop()!); // rotate everything except the first slot
  }
  if (opts.doubleRound) {
    const rounds = n - 1;
    out.push(...out.map((p) => ({ round: p.round + rounds, home: p.away, away: p.home })));
  }
  return out;
}

export type BracketSlot = string | "BYE" | null; // null = winner of an earlier match, not known yet
export type BracketMatch = { round: number; slot: number; a: BracketSlot; b: BracketSlot };

/** Standard seeding order so seed 1 and 2 can only meet in the final (e.g. 8 -> 1v8, 4v5, 2v7, 3v6 by pairs). */
function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    order = order.flatMap((s) => [s, next - s]);
  }
  return order;
}

/**
 * Single elimination. `seededTeams` is best seed first. The bracket is padded to a power of two;
 * top seeds receive the byes. Matches against BYE are emitted so the structure is complete,
 * and callers should auto-advance them.
 */
export function singleElimination(seededTeams: string[]): BracketMatch[] {
  if (new Set(seededTeams).size !== seededTeams.length) throw new Error("Duplicate team ids");
  if (seededTeams.length < 2) return [];
  let size = 2;
  while (size < seededTeams.length) size *= 2;
  const order = seedOrder(size);
  const team = (seed: number): BracketSlot => seededTeams[seed - 1] ?? "BYE";
  const matches: BracketMatch[] = [];
  for (let i = 0; i < size / 2; i++) {
    matches.push({ round: 1, slot: i + 1, a: team(order[2 * i]!), b: team(order[2 * i + 1]!) });
  }
  for (let round = 2, count = size / 4; count >= 1; round++, count /= 2) {
    for (let s = 1; s <= count; s++) matches.push({ round, slot: s, a: null, b: null });
  }
  return matches;
}

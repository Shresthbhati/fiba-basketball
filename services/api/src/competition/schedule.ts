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

// ---------------------------------------------------------------------------
// Multi-Court Constraint Engine & Schedule Conflict Detector (Spec §10.2, §17.1)
// ---------------------------------------------------------------------------

export type ConflictType =
  | "COURT_OVERLAP"
  | "TEAM_REST_VIOLATION"
  | "DOUBLE_BOOKED_TEAM"
  | "VENUE_HOURS_VIOLATION";

export interface ScheduleConflict {
  type: ConflictType;
  severity: "ERROR" | "WARNING";
  matchIds: string[];
  teamIds?: string[] | undefined;
  courtName?: string | undefined;
  description: string;
  suggestedResolution?: string | undefined;
}

export interface SchedulableMatch {
  id: string;
  homeTeamId?: string | null | undefined;
  awayTeamId?: string | null | undefined;
  homeTeamName?: string | undefined;
  awayTeamName?: string | undefined;
  courtName?: string | null | undefined;
  scheduledAt?: Date | string | null | undefined;
  estimatedDurationMinutes?: number | undefined;
  isBye?: boolean | undefined;
  round?: number | undefined;
  slot?: number | undefined;
}

export interface ScheduleValidationOptions {
  minRestMinutes?: number | undefined; // default 60 minutes
  venueHours?: {
    openingHour?: number | undefined; // e.g. 8 (08:00)
    closingHour?: number | undefined; // e.g. 22 (22:00)
  } | undefined;
}

export interface ScheduleValidationResult {
  valid: boolean;
  totalMatches: number;
  scheduledMatches: number;
  conflictCount: number;
  conflicts: ScheduleConflict[];
}

/**
 * Validates scheduling constraints across matches in a competition (Spec §10.2, §17.1):
 * - Court overlap: Two games scheduled on the same court with overlapping time windows.
 * - Double booked team: The same team scheduled in two matches with overlapping times.
 * - Team rest violation: The same team playing with less than the minimum required rest buffer.
 * - Venue hours violation: Matches starting before opening or ending after closing.
 */
export function validateScheduleConflicts(
  matches: SchedulableMatch[],
  options: ScheduleValidationOptions = {}
): ScheduleValidationResult {
  const minRestMinutes = options.minRestMinutes ?? 60;
  const conflicts: ScheduleConflict[] = [];

  // Filter to active, scheduled matches that are not byes
  const active = matches.filter(
    (m) => !m.isBye && m.scheduledAt !== null && m.scheduledAt !== undefined
  );

  interface PreparedMatch {
    match: SchedulableMatch;
    startMs: number;
    endMs: number;
    durationMins: number;
    teamIds: string[];
  }

  const prepared: PreparedMatch[] = active.map((m) => {
    const startMs = new Date(m.scheduledAt!).getTime();
    const durationMins = m.estimatedDurationMinutes ?? 60;
    const endMs = startMs + durationMins * 60 * 1000;
    const teamIds = [m.homeTeamId, m.awayTeamId].filter(
      (id): id is string => typeof id === "string" && id.length > 0
    );
    return { match: m, startMs, endMs, durationMins, teamIds };
  });

  // Check venue hours if configured
  if (options.venueHours) {
    const { openingHour, closingHour } = options.venueHours;
    for (const p of prepared) {
      const startDate = new Date(p.startMs);
      const endDate = new Date(p.endMs);
      const startHour = startDate.getUTCHours() + startDate.getUTCMinutes() / 60;
      const endHour = endDate.getUTCHours() + endDate.getUTCMinutes() / 60;

      if (openingHour !== undefined && startHour < openingHour) {
        conflicts.push({
          type: "VENUE_HOURS_VIOLATION",
          severity: "WARNING",
          matchIds: [p.match.id],
          courtName: p.match.courtName ?? undefined,
          description: `Match ${p.match.id} starts at ${startDate.toISOString().slice(11, 16)} UTC, before venue opening (${openingHour}:00 UTC).`,
          suggestedResolution: `Reschedule match to start after ${openingHour}:00 UTC.`,
        });
      } else if (closingHour !== undefined && endHour > closingHour) {
        conflicts.push({
          type: "VENUE_HOURS_VIOLATION",
          severity: "WARNING",
          matchIds: [p.match.id],
          courtName: p.match.courtName ?? undefined,
          description: `Match ${p.match.id} ends at ${endDate.toISOString().slice(11, 16)} UTC, after venue closing (${closingHour}:00 UTC).`,
          suggestedResolution: `Move match earlier or shift to another tournament day.`,
        });
      }
    }
  }

  // Check pairs for court overlap and team rest/double booking
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const a = prepared[i]!;
      const b = prepared[j]!;

      const timeOverlap = a.startMs < b.endMs && b.startMs < a.endMs;

      // 1. Court Overlap Check
      if (
        a.match.courtName &&
        b.match.courtName &&
        a.match.courtName.trim().toLowerCase() === b.match.courtName.trim().toLowerCase()
      ) {
        if (timeOverlap) {
          conflicts.push({
            type: "COURT_OVERLAP",
            severity: "ERROR",
            matchIds: [a.match.id, b.match.id],
            courtName: a.match.courtName,
            description: `Court "${a.match.courtName}" is double-booked between matches ${a.match.id} and ${b.match.id} (${new Date(Math.max(a.startMs, b.startMs)).toISOString().slice(11, 16)} overlap).`,
            suggestedResolution: `Reassign one match to another court or shift start time by at least ${Math.max(a.durationMins, b.durationMins)} minutes.`,
          });
        }
      }

      // 2. Team Conflict & Rest Window Check
      const commonTeams = a.teamIds.filter((t) => b.teamIds.includes(t));
      for (const teamId of commonTeams) {
        if (timeOverlap) {
          conflicts.push({
            type: "DOUBLE_BOOKED_TEAM",
            severity: "ERROR",
            matchIds: [a.match.id, b.match.id],
            teamIds: [teamId],
            description: `Team ${teamId} is scheduled to play in two matches at the same time (${a.match.id} and ${b.match.id}).`,
            suggestedResolution: `Reschedule one of the matches to a non-overlapping time slot.`,
          });
        } else {
          // Calculate rest gap
          let gapMins = 0;
          if (a.endMs <= b.startMs) {
            gapMins = (b.startMs - a.endMs) / (60 * 1000);
          } else if (b.endMs <= a.startMs) {
            gapMins = (a.startMs - b.endMs) / (60 * 1000);
          }

          if (gapMins < minRestMinutes) {
            conflicts.push({
              type: "TEAM_REST_VIOLATION",
              severity: gapMins < 30 ? "ERROR" : "WARNING",
              matchIds: [a.match.id, b.match.id],
              teamIds: [teamId],
              description: `Team ${teamId} has only ${Math.round(gapMins)}m rest between matches ${a.match.id} and ${b.match.id} (required minimum: ${minRestMinutes}m).`,
              suggestedResolution: `Increase the scheduling gap between matches to at least ${minRestMinutes} minutes to protect athlete recovery.`,
            });
          }
        }
      }
    }
  }

  const hasErrors = conflicts.some((c) => c.severity === "ERROR");

  return {
    valid: !hasErrors,
    totalMatches: matches.length,
    scheduledMatches: active.length,
    conflictCount: conflicts.length,
    conflicts,
  };
}

export interface AutoScheduleOptions {
  availableCourts: string[]; // e.g. ["Court 1", "Court 2", "Court 3"]
  startDateTime: Date | string; // Tournament kick-off
  matchDurationMinutes?: number | undefined; // default 60 mins
  bufferMinutes?: number | undefined; // default 15 mins between matches on same court
  minRestMinutes?: number | undefined; // default 60 mins team rest
  dailyStartHour?: number | undefined; // default 9 (09:00 UTC)
  dailyEndHour?: number | undefined; // default 21 (21:00 UTC)
}

export interface ProposedAssignment {
  matchId: string;
  courtName: string;
  scheduledAt: string;
  estimatedDurationMinutes: number;
}

export interface AutoScheduleResult {
  assignments: ProposedAssignment[];
  validation: ScheduleValidationResult;
  tournamentEndDateTime: string;
}

/**
 * Intelligent tournament scheduler:
 * Distributes matches across available courts and time windows,
 * guaranteeing zero court overlaps and respecting team minimum rest windows.
 */
export function autoScheduleTournament(
  matchesToSchedule: SchedulableMatch[],
  options: AutoScheduleOptions
): AutoScheduleResult {
  if (options.availableCourts.length === 0) {
    throw new Error("At least one court must be provided for scheduling");
  }

  const matchDurationMins = options.matchDurationMinutes ?? 60;
  const bufferMins = options.bufferMinutes ?? 15;
  const minRestMins = options.minRestMinutes ?? 60;
  const dailyStartHour = options.dailyStartHour ?? 9;
  const dailyEndHour = options.dailyEndHour ?? 21;

  // Filter out byes
  const activeMatches = matchesToSchedule
    .filter((m) => !m.isBye)
    .sort((a, b) => {
      // Sort by round, then slot, or fallback to original order
      const roundA = a.round ?? 1;
      const roundB = b.round ?? 1;
      if (roundA !== roundB) return roundA - roundB;
      const slotA = a.slot ?? 1;
      const slotB = b.slot ?? 1;
      return slotA - slotB;
    });

  const baseStart = new Date(options.startDateTime);
  let currentDayStartMs = new Date(
    Date.UTC(
      baseStart.getUTCFullYear(),
      baseStart.getUTCMonth(),
      baseStart.getUTCDate(),
      dailyStartHour,
      0,
      0
    )
  ).getTime();

  // If initial start time is already later in the day, use it
  if (baseStart.getTime() > currentDayStartMs) {
    currentDayStartMs = baseStart.getTime();
  }

  // Tracking availability
  const courtNextAvailableMs: Record<string, number> = {};
  for (const c of options.availableCourts) {
    courtNextAvailableMs[c] = currentDayStartMs;
  }

  const teamNextAvailableMs: Record<string, number> = {};
  const assignments: ProposedAssignment[] = [];

  for (const match of activeMatches) {
    const teams = [match.homeTeamId, match.awayTeamId].filter(
      (id): id is string => typeof id === "string" && id.length > 0
    );

    // Minimum time this match can start considering team rest
    let earliestTeamStartMs = currentDayStartMs;
    for (const t of teams) {
      if (teamNextAvailableMs[t] && teamNextAvailableMs[t]! > earliestTeamStartMs) {
        earliestTeamStartMs = teamNextAvailableMs[t]!;
      }
    }

    // Find the best court and start time
    let bestCourt = options.availableCourts[0]!;
    let bestStartMs = Infinity;

    for (const court of options.availableCourts) {
      const courtFreeMs = courtNextAvailableMs[court] ?? currentDayStartMs;
      const candidateStartMs = Math.max(courtFreeMs, earliestTeamStartMs);

      if (candidateStartMs < bestStartMs) {
        bestStartMs = candidateStartMs;
        bestCourt = court;
      }
    }

    // Check if the match would exceed daily end hour
    let finalStartMs = bestStartMs;
    const matchEndMs = finalStartMs + matchDurationMins * 60 * 1000;
    const matchEndDate = new Date(matchEndMs);
    const endHour = matchEndDate.getUTCHours() + matchEndDate.getUTCMinutes() / 60;

    if (endHour > dailyEndHour) {
      // Roll over to 09:00 of the next calendar day
      const nextDay = new Date(finalStartMs);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      nextDay.setUTCHours(dailyStartHour, 0, 0, 0);
      finalStartMs = nextDay.getTime();

      // Recalculate best court for the new day
      bestCourt = options.availableCourts[0]!;
      for (const court of options.availableCourts) {
        courtNextAvailableMs[court] = Math.max(courtNextAvailableMs[court] || 0, finalStartMs);
      }
    }

    const assignedStart = new Date(finalStartMs).toISOString();
    assignments.push({
      matchId: match.id,
      courtName: bestCourt,
      scheduledAt: assignedStart,
      estimatedDurationMinutes: matchDurationMins,
    });

    // Update court availability (match duration + buffer)
    const finishWithBufferMs = finalStartMs + (matchDurationMins + bufferMins) * 60 * 1000;
    courtNextAvailableMs[bestCourt] = finishWithBufferMs;

    // Update team availability (match duration + min rest)
    const finishWithRestMs = finalStartMs + (matchDurationMins + minRestMins) * 60 * 1000;
    for (const t of teams) {
      teamNextAvailableMs[t] = finishWithRestMs;
    }
  }

  // Validate assignments
  const simulatedMatches: SchedulableMatch[] = activeMatches.map((m) => {
    const a = assignments.find((asgn) => asgn.matchId === m.id);
    return {
      ...m,
      courtName: a?.courtName ?? null,
      scheduledAt: a?.scheduledAt ?? null,
      estimatedDurationMinutes: a?.estimatedDurationMinutes ?? matchDurationMins,
    };
  });

  const validation = validateScheduleConflicts(simulatedMatches, {
    minRestMinutes: minRestMins,
    venueHours: { openingHour: dailyStartHour, closingHour: dailyEndHour },
  });

  const latestEndMs = Math.max(
    ...assignments.map(
      (a) => new Date(a.scheduledAt).getTime() + a.estimatedDurationMinutes * 60 * 1000
    ),
    baseStart.getTime()
  );

  return {
    assignments,
    validation,
    tournamentEndDateTime: new Date(latestEndMs).toISOString(),
  };
}


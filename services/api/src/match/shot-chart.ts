import type { EventType } from "./event-type.js";

export type ShotZone =
  | "RESTRICTED_AREA"
  | "PAINT"
  | "MID_RANGE"
  | "CORNER_THREE_LEFT"
  | "CORNER_THREE_RIGHT"
  | "ABOVE_THE_BREAK_THREE"
  | "BACKCOURT";

export type ShotType = "TWO_POINT" | "THREE_POINT" | "FREE_THROW";

export const FIBA_HOOP_COORDS = {
  x: 12.425, // 14.0m baseline - 1.575m hoop center
  y: 0.0,
  restrictedRadius: 1.25,
  threePointRadius: 6.75,
  cornerThreeY: 6.60,
  freeThrowLineX: 8.20, // 14.0m baseline - 5.80m FT line
  keyHalfWidth: 2.45,
};

export interface RawShotEvent {
  id: string;
  type: EventType;
  side: "home" | "away" | null;
  period: number;
  clockSeconds?: number | null;
  playerId?: string | null;
  correctsEventId?: string | null;
  coordX?: number | null;
  coordY?: number | null;
  shotZone?: string | null;
  distanceMeters?: number | null;
}

export interface ShotItem {
  id: string;
  type: EventType;
  shotType: ShotType;
  side: "home" | "away";
  period: number;
  clockSeconds: number | null;
  playerId: string | null;
  playerName?: string | null;
  jerseyNumber?: number | null;
  made: boolean;
  points: number;
  coordX: number;
  coordY: number;
  distanceMeters: number;
  zone: ShotZone;
}

export interface ZoneSummary {
  zone: ShotZone;
  label: string;
  makes: number;
  attempts: number;
  pct: number;
  points: number;
  frequencyPct: number;
}

export interface ShotChartSummary {
  totalShots: number;
  totalPoints: number;
  fgm: number;
  fga: number;
  fgPct: number;
  twoPm: number;
  twoPa: number;
  twoPPct: number;
  threePm: number;
  threePa: number;
  threePPct: number;
  ftm: number;
  fta: number;
  ftPct: number;
  eFgPct: number;
  tsPct: number;
}

export interface ShotChartResult {
  shots: ShotItem[];
  zones: Record<ShotZone, ZoneSummary>;
  summary: ShotChartSummary;
  smallSample: boolean;
}

export const ZONE_LABELS: Record<ShotZone, string> = {
  RESTRICTED_AREA: "Restricted Area (Under Rim)",
  PAINT: "In The Paint (Non-RA)",
  MID_RANGE: "Mid-Range",
  CORNER_THREE_LEFT: "Left Corner 3",
  CORNER_THREE_RIGHT: "Right Corner 3",
  ABOVE_THE_BREAK_THREE: "Above The Break 3",
  BACKCOURT: "Backcourt (Heave)",
};

/**
 * Pure geometric classifier assigning court coordinate to FIBA standard shot zones.
 * Coordinates are in half-court meters: X in [0, 14], Y in [-7.5, +7.5].
 */
export function classifyShot(
  type: EventType,
  coordX?: number | null,
  coordY?: number | null
): { shotType: ShotType; distanceMeters: number; zone: ShotZone } {
  const isThree = type === "THREE_POINT" || type === "THREE_POINT_MISSED";
  const isFt = type === "FREE_THROW" || type === "FREE_THROW_MISSED";
  const shotType: ShotType = isFt ? "FREE_THROW" : isThree ? "THREE_POINT" : "TWO_POINT";

  if (coordX == null || coordY == null) {
    if (isFt) {
      return { shotType, distanceMeters: 4.225, zone: "PAINT" };
    }
    if (isThree) {
      return { shotType, distanceMeters: 6.75, zone: "ABOVE_THE_BREAK_THREE" };
    }
    return { shotType, distanceMeters: 2.5, zone: "PAINT" };
  }

  const dx = FIBA_HOOP_COORDS.x - coordX;
  const dy = FIBA_HOOP_COORDS.y - coordY;
  const rawDist = Math.sqrt(dx * dx + dy * dy);
  const distanceMeters = Math.round(rawDist * 100) / 100;

  // 1. Backcourt
  if (coordX < 0 || distanceMeters > 14.0) {
    return { shotType, distanceMeters, zone: "BACKCOURT" };
  }

  // 2. Corner 3s (behind sideline threshold 6.60m from center and within baseline corner segment)
  if (Math.abs(coordY) >= FIBA_HOOP_COORDS.cornerThreeY && coordX >= 11.01) {
    const zone: ShotZone = coordY < 0 ? "CORNER_THREE_LEFT" : "CORNER_THREE_RIGHT";
    return { shotType, distanceMeters, zone };
  }

  // 3. Above the break 3s
  if (distanceMeters >= FIBA_HOOP_COORDS.threePointRadius) {
    return { shotType, distanceMeters, zone: "ABOVE_THE_BREAK_THREE" };
  }

  // 4. Restricted area (under rim arc)
  if (distanceMeters <= FIBA_HOOP_COORDS.restrictedRadius) {
    return { shotType, distanceMeters, zone: "RESTRICTED_AREA" };
  }

  // 5. Paint / Key
  if (
    coordX >= FIBA_HOOP_COORDS.freeThrowLineX &&
    Math.abs(coordY) <= FIBA_HOOP_COORDS.keyHalfWidth
  ) {
    return { shotType, distanceMeters, zone: "PAINT" };
  }

  // 6. Mid-Range (all other shots inside arc)
  return { shotType, distanceMeters, zone: "MID_RANGE" };
}

/**
 * Aggregates a list of match events into a comprehensive shot chart with zone splits,
 * efficiency metrics (eFG%, TS%), and sample sizes.
 */
export function buildShotChart(
  events: RawShotEvent[],
  rosterInfo: Map<string, { name: string; jersey: number }> = new Map()
): ShotChartResult {
  const voided = new Set(
    events
      .filter((e) => e.type === "CORRECTION" && e.correctsEventId)
      .map((e) => e.correctsEventId!)
  );

  const shotEventTypes = new Set<EventType>([
    "FIELD_GOAL",
    "FIELD_GOAL_MISSED",
    "THREE_POINT",
    "THREE_POINT_MISSED",
    "FREE_THROW",
    "FREE_THROW_MISSED",
  ]);

  const shots: ShotItem[] = [];

  const initialZoneSummary = (zone: ShotZone): ZoneSummary => ({
    zone,
    label: ZONE_LABELS[zone],
    makes: 0,
    attempts: 0,
    pct: 0,
    points: 0,
    frequencyPct: 0,
  });

  const zones: Record<ShotZone, ZoneSummary> = {
    RESTRICTED_AREA: initialZoneSummary("RESTRICTED_AREA"),
    PAINT: initialZoneSummary("PAINT"),
    MID_RANGE: initialZoneSummary("MID_RANGE"),
    CORNER_THREE_LEFT: initialZoneSummary("CORNER_THREE_LEFT"),
    CORNER_THREE_RIGHT: initialZoneSummary("CORNER_THREE_RIGHT"),
    ABOVE_THE_BREAK_THREE: initialZoneSummary("ABOVE_THE_BREAK_THREE"),
    BACKCOURT: initialZoneSummary("BACKCOURT"),
  };

  let twoPm = 0;
  let twoPa = 0;
  let threePm = 0;
  let threePa = 0;
  let ftm = 0;
  let fta = 0;
  let totalPoints = 0;

  for (const e of events) {
    if (e.type === "CORRECTION" || voided.has(e.id) || !e.side || !shotEventTypes.has(e.type)) {
      continue;
    }

    const { shotType, distanceMeters, zone } = classifyShot(
      e.type,
      e.coordX,
      e.coordY
    );

    const made =
      e.type === "FIELD_GOAL" || e.type === "THREE_POINT" || e.type === "FREE_THROW";

    const points = made ? (shotType === "THREE_POINT" ? 3 : shotType === "FREE_THROW" ? 1 : 2) : 0;

    // Track shooting breakdown
    if (shotType === "TWO_POINT") {
      twoPa++;
      if (made) twoPm++;
    } else if (shotType === "THREE_POINT") {
      threePa++;
      if (made) threePm++;
    } else if (shotType === "FREE_THROW") {
      fta++;
      if (made) ftm++;
    }

    totalPoints += points;

    // Zone aggregation (for field goals; free throws excluded from field goal zone totals)
    if (shotType !== "FREE_THROW") {
      const z = zones[zone];
      z.attempts++;
      if (made) {
        z.makes++;
        z.points += points;
      }
    }

    const player = e.playerId ? rosterInfo.get(e.playerId) : undefined;

    shots.push({
      id: e.id,
      type: e.type,
      shotType,
      side: e.side,
      period: e.period,
      clockSeconds: e.clockSeconds ?? null,
      playerId: e.playerId ?? null,
      playerName: player?.name ?? null,
      jerseyNumber: player?.jersey ?? null,
      made,
      points,
      coordX: e.coordX ?? (isFinite(distanceMeters) ? FIBA_HOOP_COORDS.x - distanceMeters : 10),
      coordY: e.coordY ?? 0,
      distanceMeters,
      zone,
    });
  }

  const fga = twoPa + threePa;
  const fgm = twoPm + threePm;

  // Compute zone percentages and frequencies
  for (const key of Object.keys(zones) as ShotZone[]) {
    const z = zones[key];
    z.pct = z.attempts > 0 ? Math.round((z.makes / z.attempts) * 1000) / 10 : 0;
    z.frequencyPct = fga > 0 ? Math.round((z.attempts / fga) * 1000) / 10 : 0;
  }

  const fgPct = fga > 0 ? Math.round((fgm / fga) * 1000) / 10 : 0;
  const twoPPct = twoPa > 0 ? Math.round((twoPm / twoPa) * 1000) / 10 : 0;
  const threePPct = threePa > 0 ? Math.round((threePm / threePa) * 1000) / 10 : 0;
  const ftPct = fta > 0 ? Math.round((ftm / fta) * 1000) / 10 : 0;

  // Effective Field Goal % = (FGM + 0.5 * 3PM) / FGA
  const eFgPct = fga > 0 ? Math.round(((fgm + 0.5 * threePm) / fga) * 1000) / 10 : 0;

  // True Shooting % = Points / (2 * (FGA + 0.44 * FTA))
  const tsDenominator = 2 * (fga + 0.44 * fta);
  const tsPct = tsDenominator > 0 ? Math.round((totalPoints / tsDenominator) * 1000) / 10 : 0;

  const summary: ShotChartSummary = {
    totalShots: fga + fta,
    totalPoints,
    fgm,
    fga,
    fgPct,
    twoPm,
    twoPa,
    twoPPct,
    threePm,
    threePa,
    threePPct,
    ftm,
    fta,
    ftPct,
    eFgPct,
    tsPct,
  };

  return {
    shots,
    zones,
    summary,
    smallSample: fga < 10,
  };
}

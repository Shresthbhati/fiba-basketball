/**
 * Basketball combine normative benchmarks and percentile calculation engine.
 * Master Spec §5.4–§5.9 & WP-6.2.
 * Based on empirical FIBA, NCAA, and NBA combine athletic testing distributions.
 */

export type Cohort =
  | "U14_MALE"
  | "U14_FEMALE"
  | "U16_MALE"
  | "U16_FEMALE"
  | "U18_MALE"
  | "U18_FEMALE"
  | "COLLEGIATE_MALE"
  | "COLLEGIATE_FEMALE"
  | "PRO_MALE"
  | "PRO_FEMALE";

export interface PercentileAnchors {
  p10: number;
  p25: number;
  p50: number; // median
  p75: number;
  p90: number;
  p99: number;
}

export interface ProtocolBenchmark {
  slug: string;
  name: string;
  category: "JUMP" | "SPEED" | "AGILITY" | "CONDITIONING";
  unit: string;
  higherIsBetter: boolean;
  cohorts: Record<Cohort, PercentileAnchors>;
}

export const NORMATIVE_BENCHMARKS: Record<string, ProtocolBenchmark> = {
  "standing-vertical-jump": {
    slug: "standing-vertical-jump",
    name: "Standing Vertical Jump",
    category: "JUMP",
    unit: "cm",
    higherIsBetter: true,
    cohorts: {
      U14_MALE: { p10: 34, p25: 40, p50: 47, p75: 53, p90: 60, p99: 68 },
      U14_FEMALE: { p10: 28, p25: 33, p50: 38, p75: 44, p90: 50, p99: 58 },
      U16_MALE: { p10: 44, p25: 51, p50: 58, p75: 65, p90: 72, p99: 82 },
      U16_FEMALE: { p10: 32, p25: 38, p50: 44, p75: 50, p90: 57, p99: 66 },
      U18_MALE: { p10: 50, p25: 57, p50: 65, p75: 72, p90: 80, p99: 92 },
      U18_FEMALE: { p10: 35, p25: 41, p50: 48, p75: 54, p90: 62, p99: 72 },
      COLLEGIATE_MALE: { p10: 55, p25: 62, p50: 71, p75: 78, p90: 86, p99: 98 },
      COLLEGIATE_FEMALE: { p10: 38, p25: 44, p50: 51, p75: 58, p90: 65, p99: 75 },
      PRO_MALE: { p10: 60, p25: 68, p50: 76, p75: 84, p90: 92, p99: 104 },
      PRO_FEMALE: { p10: 42, p25: 48, p50: 56, p75: 63, p90: 70, p99: 80 },
    },
  },
  "max-vertical-jump": {
    slug: "max-vertical-jump",
    name: "Maximum Vertical Jump",
    category: "JUMP",
    unit: "cm",
    higherIsBetter: true,
    cohorts: {
      U14_MALE: { p10: 42, p25: 48, p50: 56, p75: 63, p90: 71, p99: 80 },
      U14_FEMALE: { p10: 34, p25: 40, p50: 46, p75: 52, p90: 59, p99: 68 },
      U16_MALE: { p10: 53, p25: 61, p50: 70, p75: 78, p90: 87, p99: 98 },
      U16_FEMALE: { p10: 39, p25: 46, p50: 53, p75: 61, p90: 69, p99: 78 },
      U18_MALE: { p10: 60, p25: 68, p50: 78, p75: 86, p90: 95, p99: 108 },
      U18_FEMALE: { p10: 43, p25: 50, p50: 58, p75: 66, p90: 74, p99: 84 },
      COLLEGIATE_MALE: { p10: 65, p25: 74, p50: 84, p75: 92, p90: 101, p99: 115 },
      COLLEGIATE_FEMALE: { p10: 46, p25: 53, p50: 61, p75: 69, p90: 78, p99: 88 },
      PRO_MALE: { p10: 72, p25: 80, p50: 90, p75: 98, p90: 107, p99: 122 },
      PRO_FEMALE: { p10: 50, p25: 58, p50: 67, p75: 75, p90: 84, p99: 94 },
    },
  },
  "three-quarter-court-sprint": {
    slug: "three-quarter-court-sprint",
    name: "3/4 Court Sprint (22.86m)",
    category: "SPEED",
    unit: "seconds",
    higherIsBetter: false, // lower time is faster
    cohorts: {
      U14_MALE: { p10: 4.10, p25: 3.92, p50: 3.75, p75: 3.60, p90: 3.48, p99: 3.32 },
      U14_FEMALE: { p10: 4.35, p25: 4.15, p50: 3.98, p75: 3.82, p90: 3.68, p99: 3.50 },
      U16_MALE: { p10: 3.80, p25: 3.65, p50: 3.50, p75: 3.38, p90: 3.26, p99: 3.12 },
      U16_FEMALE: { p10: 4.10, p25: 3.94, p50: 3.78, p75: 3.62, p90: 3.48, p99: 3.32 },
      U18_MALE: { p10: 3.62, p25: 3.48, p50: 3.35, p75: 3.24, p90: 3.14, p99: 3.01 },
      U18_FEMALE: { p10: 3.95, p25: 3.80, p50: 3.64, p75: 3.50, p90: 3.38, p99: 3.20 },
      COLLEGIATE_MALE: { p10: 3.52, p25: 3.40, p50: 3.28, p75: 3.18, p90: 3.08, p99: 2.95 },
      COLLEGIATE_FEMALE: { p10: 3.85, p25: 3.70, p50: 3.55, p75: 3.42, p90: 3.30, p99: 3.12 },
      PRO_MALE: { p10: 3.42, p25: 3.32, p50: 3.21, p75: 3.11, p90: 3.02, p99: 2.89 },
      PRO_FEMALE: { p10: 3.75, p25: 3.60, p50: 3.46, p75: 3.33, p90: 3.22, p99: 3.05 },
    },
  },
  "lane-agility-drill": {
    slug: "lane-agility-drill",
    name: "Lane Agility Drill (5.8m x 4.9m)",
    category: "AGILITY",
    unit: "seconds",
    higherIsBetter: false,
    cohorts: {
      U14_MALE: { p10: 14.50, p25: 13.70, p50: 12.90, p75: 12.20, p90: 11.60, p99: 10.90 },
      U14_FEMALE: { p10: 15.60, p25: 14.80, p50: 14.00, p75: 13.20, p90: 12.50, p99: 11.70 },
      U16_MALE: { p10: 13.20, p25: 12.50, p50: 11.80, p75: 11.20, p90: 10.70, p99: 10.10 },
      U16_FEMALE: { p10: 14.40, p25: 13.60, p50: 12.80, p75: 12.10, p90: 11.50, p99: 10.80 },
      U18_MALE: { p10: 12.60, p25: 11.90, p50: 11.30, p75: 10.70, p90: 10.30, p99: 9.75 },
      U18_FEMALE: { p10: 13.80, p25: 13.10, p50: 12.40, p75: 11.80, p90: 11.10, p99: 10.50 },
      COLLEGIATE_MALE: { p10: 12.20, p25: 11.60, p50: 11.00, p75: 10.50, p90: 10.10, p99: 9.65 },
      COLLEGIATE_FEMALE: { p10: 13.50, p25: 12.80, p50: 12.10, p75: 11.50, p90: 10.90, p99: 10.30 },
      PRO_MALE: { p10: 11.70, p25: 11.20, p50: 10.70, p75: 10.25, p90: 9.85, p99: 9.40 },
      PRO_FEMALE: { p10: 13.00, p25: 12.40, p50: 11.80, p75: 11.20, p90: 10.65, p99: 10.05 },
    },
  },
  "pro-agility-shuttle": {
    slug: "pro-agility-shuttle",
    name: "Pro-Agility Shuttle (5-10-5)",
    category: "AGILITY",
    unit: "seconds",
    higherIsBetter: false,
    cohorts: {
      U14_MALE: { p10: 5.40, p25: 5.15, p50: 4.90, p75: 4.68, p90: 4.48, p99: 4.25 },
      U14_FEMALE: { p10: 5.80, p25: 5.50, p50: 5.25, p75: 5.00, p90: 4.78, p99: 4.50 },
      U16_MALE: { p10: 5.05, p25: 4.80, p50: 4.58, p75: 4.38, p90: 4.20, p99: 3.98 },
      U16_FEMALE: { p10: 5.45, p25: 5.20, p50: 4.95, p75: 4.72, p90: 4.52, p99: 4.28 },
      U18_MALE: { p10: 4.88, p25: 4.65, p50: 4.45, p75: 4.26, p90: 4.10, p99: 3.90 },
      U18_FEMALE: { p10: 5.30, p25: 5.08, p50: 4.82, p75: 4.60, p90: 4.40, p99: 4.18 },
      COLLEGIATE_MALE: { p10: 4.80, p25: 4.55, p50: 4.35, p75: 4.18, p90: 4.02, p99: 3.82 },
      COLLEGIATE_FEMALE: { p10: 5.25, p25: 5.00, p50: 4.75, p75: 4.52, p90: 4.35, p99: 4.10 },
      PRO_MALE: { p10: 4.65, p25: 4.45, p50: 4.25, p75: 4.09, p90: 3.95, p99: 3.76 },
      PRO_FEMALE: { p10: 5.10, p25: 4.88, p50: 4.65, p75: 4.44, p90: 4.25, p99: 4.02 },
    },
  },
  "yoyo-intermittent-recovery-1": {
    slug: "yoyo-intermittent-recovery-1",
    name: "Yo-Yo Intermittent Recovery Level 1",
    category: "CONDITIONING",
    unit: "level_shuttle",
    higherIsBetter: true,
    cohorts: {
      U14_MALE: { p10: 11.1, p25: 12.4, p50: 13.8, p75: 15.2, p90: 16.5, p99: 18.0 },
      U14_FEMALE: { p10: 9.8, p25: 11.0, p50: 12.2, p75: 13.5, p90: 14.8, p99: 16.2 },
      U16_MALE: { p10: 13.2, p25: 14.6, p50: 16.1, p75: 17.5, p90: 18.8, p99: 20.2 },
      U16_FEMALE: { p10: 11.5, p25: 12.8, p50: 14.2, p75: 15.6, p90: 16.9, p99: 18.4 },
      U18_MALE: { p10: 14.0, p25: 15.5, p50: 17.2, p75: 18.6, p90: 19.8, p99: 21.2 },
      U18_FEMALE: { p10: 12.2, p25: 13.6, p50: 15.0, p75: 16.4, p90: 17.7, p99: 19.1 },
      COLLEGIATE_MALE: { p10: 14.5, p25: 16.1, p50: 17.8, p75: 19.3, p90: 20.5, p99: 21.8 },
      COLLEGIATE_FEMALE: { p10: 12.8, p25: 14.2, p50: 15.8, p75: 17.2, p90: 18.5, p99: 20.0 },
      PRO_MALE: { p10: 15.8, p25: 17.2, p50: 18.8, p75: 20.2, p90: 21.4, p99: 22.8 },
      PRO_FEMALE: { p10: 13.6, p25: 15.0, p50: 16.6, p75: 18.0, p90: 19.3, p99: 20.8 },
    },
  },
};

/**
 * Calculates continuous piecewise linear percentile for an athletic test raw measurement.
 * Returns an integer percentile between 1 and 99.
 */
export function calculatePercentile(
  rawValue: number,
  protocolSlug: string,
  cohort: Cohort = "COLLEGIATE_MALE",
): number {
  const benchmark = NORMATIVE_BENCHMARKS[protocolSlug];
  if (!benchmark) return 50;

  const anchors = benchmark.cohorts[cohort] ?? benchmark.cohorts.COLLEGIATE_MALE;

  const pairs: Array<{ p: number; v: number }> = [
    { p: 10, v: anchors.p10 },
    { p: 25, v: anchors.p25 },
    { p: 50, v: anchors.p50 },
    { p: 75, v: anchors.p75 },
    { p: 90, v: anchors.p90 },
    { p: 99, v: anchors.p99 },
  ];

  if (benchmark.higherIsBetter) {
    if (rawValue >= anchors.p99) return 99;
    if (rawValue <= anchors.p10) {
      const bottom = Math.max(1, Math.round((rawValue / anchors.p10) * 10));
      return Math.min(bottom, 10);
    }
    for (let i = 0; i < pairs.length - 1; i++) {
      const a = pairs[i]!;
      const b = pairs[i + 1]!;
      if (rawValue >= a.v && rawValue <= b.v) {
        const span = b.v - a.v;
        const fraction = span > 0 ? (rawValue - a.v) / span : 0;
        return Math.round(a.p + fraction * (b.p - a.p));
      }
    }
    return 50;
  } else {
    // Lower time / score is better
    if (rawValue <= anchors.p99) return 99;
    if (rawValue >= anchors.p10) {
      const bottom = Math.max(1, Math.round((anchors.p10 / rawValue) * 10));
      return Math.min(bottom, 10);
    }
    // pairs are ordered p10 (slower, higher time) to p99 (faster, lower time)
    for (let i = 0; i < pairs.length - 1; i++) {
      const a = pairs[i]!; // e.g. p10 with larger time v
      const b = pairs[i + 1]!; // e.g. p25 with smaller time v
      if (rawValue <= a.v && rawValue >= b.v) {
        const span = a.v - b.v;
        const fraction = span > 0 ? (a.v - rawValue) / span : 0;
        return Math.round(a.p + fraction * (b.p - a.p));
      }
    }
    return 50;
  }
}

export interface AthleticSignature {
  powerPercentile: number | null;
  speedPercentile: number | null;
  agilityPercentile: number | null;
  conditioningPercentile: number | null;
  combineIndex: number | null;
  testsCompleted: number;
}

/**
 * Calculates aggregate athletic signature dimensions and combine composite index.
 */
export function calculateAthleticSignature(
  resultsByProtocol: Record<string, number>,
  cohort: Cohort = "COLLEGIATE_MALE",
): AthleticSignature {
  const percentiles: Record<string, number> = {};
  for (const [slug, value] of Object.entries(resultsByProtocol)) {
    if (NORMATIVE_BENCHMARKS[slug]) {
      percentiles[slug] = calculatePercentile(value, slug, cohort);
    }
  }

  // Power: average of available vertical jumps
  const powerPool = [percentiles["standing-vertical-jump"], percentiles["max-vertical-jump"]].filter(
    (x): x is number => typeof x === "number",
  );
  const powerPercentile = powerPool.length > 0 ? Math.round(powerPool.reduce((a, b) => a + b, 0) / powerPool.length) : null;

  // Speed: 3/4 court sprint
  const speedPercentile = percentiles["three-quarter-court-sprint"] ?? null;

  // Agility: lane agility and/or pro-agility
  const agilityPool = [percentiles["lane-agility-drill"], percentiles["pro-agility-shuttle"]].filter(
    (x): x is number => typeof x === "number",
  );
  const agilityPercentile = agilityPool.length > 0 ? Math.round(agilityPool.reduce((a, b) => a + b, 0) / agilityPool.length) : null;

  // Conditioning: Yo-Yo IR1
  const conditioningPercentile = percentiles["yoyo-intermittent-recovery-1"] ?? null;

  // Combine Index: weighted average of completed pillars
  const activePillars = [powerPercentile, speedPercentile, agilityPercentile, conditioningPercentile].filter(
    (x): x is number => typeof x === "number",
  );

  const combineIndex =
    activePillars.length > 0 ? Math.round(activePillars.reduce((a, b) => a + b, 0) / activePillars.length) : null;

  return {
    powerPercentile,
    speedPercentile,
    agilityPercentile,
    conditioningPercentile,
    combineIndex,
    testsCompleted: Object.keys(percentiles).length,
  };
}

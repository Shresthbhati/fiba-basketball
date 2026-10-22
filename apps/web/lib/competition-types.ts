export type CompetitionSummary = { id: string; name: string; format: "ROUND_ROBIN" | "SINGLE_ELIMINATION"; status: "DRAFT" | "PUBLISHED" | "COMPLETED"; mine: boolean };
export type CompetitionDetail = CompetitionSummary & { teams: { id: string; name: string; seed: number | null }[]; canManage: boolean };
export type MatchRow = {
  id: string; round: number; slot: number; homeTeamId: string | null; awayTeamId: string | null; state: "SCHEDULED" | "LIVE" | "FINISHED" | "LOCKED";
  isBye: boolean; homeScore: number | null; awayScore: number | null; scheduledAt?: string | null; forfeit?: boolean;
};
export type StandingRow = { rank: number; name: string; played: number; wins: number; losses: number; points: number; pointsFor: number; pointsAgainst: number; diff: number };
export const formatLabel = { ROUND_ROBIN: "Round robin", SINGLE_ELIMINATION: "Knockout" } as const;
export const statusLabel = { DRAFT: "Draft — only you can see it", PUBLISHED: "Under way", COMPLETED: "Completed" } as const;
export const stateLabel = { SCHEDULED: "Scheduled", LIVE: "Live", FINISHED: "Final", LOCKED: "Final (locked)" } as const;

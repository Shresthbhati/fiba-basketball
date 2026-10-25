export type CompetitionSummary = { id: string; name: string; format: "ROUND_ROBIN" | "SINGLE_ELIMINATION"; status: "DRAFT" | "PUBLISHED" | "COMPLETED"; mine: boolean };
export type CompetitionDetail = CompetitionSummary & { teams: { id: string; name: string; seed: number | null }[]; canManage: boolean };
export type MatchRow = {
  id: string; round: number; slot: number; homeTeamId: string | null; awayTeamId: string | null; state: "SCHEDULED" | "LIVE" | "FINISHED" | "LOCKED";
  isBye: boolean; homeScore: number | null; awayScore: number | null; scheduledAt?: string | null; forfeit?: boolean;
  courtName?: string | null; estimatedDurationMinutes?: number;
};
export type OfficialRow = { id: string; userId: string; role: "SCOREKEEPER" | "REFEREE"; email: string; displayName: string; createdAt: string };
export type CommandCenterAlerts = { delayed: boolean; unresolved: boolean; missingOfficials: boolean; hasConflict?: boolean };
export type CommandCenterMatch = MatchRow & { homeName: string; awayName: string; alerts: CommandCenterAlerts };
export type CommandCenterData = {
  competition: CompetitionSummary;
  summary: { totalMatches: number; scheduled: number; live: number; finished: number; delayed: number; unresolved: number; officialsCount: number; conflictCount?: number };
  officials: OfficialRow[];
  matches: CommandCenterMatch[];
};
export type DelaySimulation = {
  matchId: string; round: number; slot: number; homeName: string; awayName: string; state: string;
  currentScheduledAt: string | null; proposedScheduledAt: string; delayMinutes: number;
};
export type DelayImpactPreview = {
  matchId: string; delayMinutes: number; affectedCount: number; simulations: DelaySimulation[];
};
export type StandingRow = {
  rank: number;
  name: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  points: number;
};

export const formatLabel = { ROUND_ROBIN: "Round robin", SINGLE_ELIMINATION: "Knockout" } as const;
export const statusLabel = { DRAFT: "Draft — only you can see it", PUBLISHED: "Under way", COMPLETED: "Completed" } as const;
export const stateLabel = { SCHEDULED: "Scheduled", LIVE: "Live", FINISHED: "Final", LOCKED: "Final (locked)" } as const;

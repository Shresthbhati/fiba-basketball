export type TeamSummary = { id: string; name: string };
export type Member = { userId: string; name: string; role: string };
export type FilmGame = {
  id: string; teamId: string; title: string; opponent: string | null; playedOn: string | null;
  video: { status: "NONE" | "READY"; type: string | null; bytes: number | null };
  canManage?: boolean; matchId?: string | null; synced?: boolean;
};
export type Clip = { id: string; startMs: number; endMs: number; tags: string[]; note: string | null };

export const fmtTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export type TimelineItem = {
  id: string; type: string; side: "home" | "away" | null; period: number; videoMs: number | null;
  playerId?: string | null;
  jersey: number | null; playerName?: string; homeScore: number; awayScore: number;
};
export type Timeline = { linked: false } | { linked: true; synced: boolean; ours: "home" | "away"; items: TimelineItem[]; untimed: number; syncPoints: { eventId: string; videoMs: number }[] };
export type TeamMatch = { id: string; competition: string; state: string; scheduledAt: string | null; home: string; away: string; homeScore: number | null; awayScore: number | null };

const WHAT: Record<string, string> = {
  FIELD_GOAL: "+2", THREE_POINT: "+3", FREE_THROW: "+1", FIELD_GOAL_MISSED: "missed 2", THREE_POINT_MISSED: "missed 3", FREE_THROW_MISSED: "missed FT",
  REBOUND: "rebound", ASSIST: "assist", TURNOVER: "turnover", PLAYER_FOUL: "foul", TECHNICAL_FOUL: "technical foul", TEAM_FOUL: "team foul",
  TIMEOUT: "timeout", PERIOD_START: "period starts", PERIOD_END: "period ends", GAME_START: "game starts", GAME_END: "game ends", JUMP_BALL: "jump ball", SUBSTITUTION: "substitution",
};
const period = (p: number) => (p <= 4 ? `Q${p}` : `OT${p - 4}`);
/** "Q2 · our +3 #7 Ann · 41–38" — names only appear for our own side (the server only sends those). */
export function timelineLabel(i: TimelineItem, ours: "home" | "away"): string {
  const who = i.side === null ? "" : i.side === ours ? "our " : "their ";
  const player = i.jersey === null ? "" : ` #${i.jersey}${i.playerName ? ` ${i.playerName}` : ""}`;
  return `${period(i.period)} · ${who}${WHAT[i.type] ?? i.type.toLowerCase()}${player} · ${i.homeScore}–${i.awayScore}`;
}
export const SCORING_TYPES = new Set(["FIELD_GOAL", "THREE_POINT", "FREE_THROW"]);

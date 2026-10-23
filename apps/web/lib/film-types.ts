export type TeamSummary = { id: string; name: string };
export type Member = { userId: string; name: string; role: string };
export type FilmGame = {
  id: string; teamId: string; title: string; opponent: string | null; playedOn: string | null;
  video: { status: "NONE" | "READY"; type: string | null; bytes: number | null };
  canManage?: boolean;
};
export type Clip = { id: string; startMs: number; endMs: number; tags: string[]; note: string | null };

export const fmtTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

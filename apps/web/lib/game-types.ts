export type Game = {
  id: string; title: string; courtId: string; startsAt: string; endsAt: string; capacity: number; skillBand: string | null;
  confirmedCount: number; spotsLeft: number; phase: "OPEN" | "FULL" | "IN_PROGRESS" | "UNCONFIRMED" | "COMPLETED" | "CANCELLED";
  courtName?: string; distanceM?: number;
};
export type GameDetail = Game & {
  hostName: string | null; checkInCount: number; waitlistCount: number; myStatus: "CONFIRMED" | "WAITLIST" | "CANCELLED" | null;
  isHost: boolean; participants?: { name: string; status: string; checkedIn: boolean }[];
};
export const phaseLabel: Record<Game["phase"], string> = {
  OPEN: "Open", FULL: "Full — waitlist open", IN_PROGRESS: "In progress", UNCONFIRMED: "Ended — waiting for host to confirm",
  COMPLETED: "Completed", CANCELLED: "Cancelled",
};
export const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Turns the "host a game" form's local date-times into the weekly-series request. Pure, so it can be tested without a browser. */
export function seriesBody(
  f: { courtId: string; title: string; capacity: number; skillBand?: string; startsAtLocal: string; endsAtLocal: string },
  timezone: string,
) {
  const [date, time] = f.startsAtLocal.split("T") as [string, string];
  const asUtc = (local: string) => Date.parse(`${local.slice(0, 16)}:00Z`);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const durationMin = Math.round((asUtc(f.endsAtLocal) - asUtc(f.startsAtLocal)) / 60_000);
  return {
    courtId: f.courtId, title: f.title, capacity: f.capacity, ...(f.skillBand ? { skillBand: f.skillBand } : {}),
    weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay(), startTime: time.slice(0, 5), durationMin, timezone,
  };
}

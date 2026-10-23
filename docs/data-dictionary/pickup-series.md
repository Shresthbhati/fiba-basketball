# Recurring pickup games

| Table / column | Purpose |
|---|---|
| `pickup_series` | A weekly repeating game: court, title, `weekday` (0 = Sunday), local `start_time` ("HH:MM"), `duration_min`, IANA `timezone`, capacity, skill band, `active`. |
| `pickup_games.series_id` | Set on games created from a series. `(series_id, starts_at)` is unique, so refreshing never duplicates a game and a cancelled occurrence is never re-created. |

How it works: occurrences are ordinary `pickup_games` rows created four weeks ahead (`HORIZON_DAYS`). They are created when
the series is made and then hourly by the API process (`materializeAll`, idempotent, safe with several instances). The start
time is the wall-clock time in the series' time zone, so it stays "6pm" across daylight-saving changes. A local time that does
not exist (spring-forward gap) starts just after the gap.

Stopping a series (`POST /api/v1/pickup/series/:id/cancel`, host only) marks it inactive and cancels future OPEN games.
Played games are untouched. Cancelling one game (`/pickup/:id/cancel`) affects only that occurrence.

Not built: editing a series, skipping a week in advance, notifying players when games are cancelled (there is no notification system yet).

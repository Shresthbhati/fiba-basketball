# live scoring

- `match_events`: append-only scorebook. `id` is chosen by the device (UUID) so retries are idempotent; `server_seq` is assigned per match under a row lock; `local_seq` is the device's own order.
  Types: GAME_START, GAME_END, PERIOD_START/END, FIELD_GOAL (+MISSED), THREE_POINT (+MISSED), FREE_THROW (+MISSED), PLAYER_FOUL, TECHNICAL_FOUL, TEAM_FOUL, TIMEOUT, REBOUND, ASSIST, TURNOVER, SUBSTITUTION, JUMP_BALL, CLOCK_ADJUST, CORRECTION.
- The score is never stored: `project()` rebuilds it from the log. A CORRECTION cancels the event it references (events are never edited or deleted).

API
- `POST /api/v1/matches/:id/events` `{ baseVersion?, events[1..100] }` → `{ version, accepted, duplicates, state }`. Needs `match:score` (scorekeeper/referee/organizer of that competition); others get 404.
  - Already-stored ids are skipped, so a device can resend a whole queue safely.
  - If `baseVersion` is older than events entered by someone else, nothing is written and the response is 409 problem+json with `currentVersion`, `state`, `newerEvents`. The client reconciles and resends with the new `baseVersion`. A scorer's own events never conflict.
  - Validation failures (422) roll back the whole batch.
  - The first accepted event moves the match SCHEDULED → LIVE. Finished/locked matches refuse events (409).
- `GET /api/v1/matches/:id/state`, `GET /matches/:id/events?after=<version>`: public once the competition is published.
- `GET /api/v1/matches/:id/stream`: Server-Sent Events, envelope `{ id, schemaVersion: 1, resourceId, resourceVersion, occurredAt, type: "match.state.updated", data }`.
  Messages are hints: after a reconnect, refetch `/state`. The bus is in-process; multiple API instances need Redis pub/sub.
- `POST /api/v1/matches/:id/finalize`: takes the projected score as the official result (same audit log and bracket advancement as manual entry). Tied scores are refused.
- `POST /api/v1/competitions/:id/officials` `{ email, role: SCOREKEEPER | REFEREE }`: organizer assigns an official to that competition.

Not built yet: the scorekeeper web app (offline queue, conflict screen), player-level stats/roster, clock tracking, per-user stream auth for unpublished matches.

# Player credit and box scores

`match_events.player_id` (nullable): the rostered player an event is credited to. The scorer picks a player once per side and the
choice sticks until changed ("No player" credits nobody). Events without a player are fine and still count for the team.

Server rules (`match/events.ts`): a player can only be named on player events (`PLAYER_EVENTS`: made/missed field goals, threes and free
throws, rebound, assist, turnover, player/technical foul), the event must have a side, and the player must be on the roster of the team
for that side in this competition (else 422 and the whole batch is refused). Corrections work as before: a corrected event stops counting
for the player too.

## Box score (`GET /api/v1/matches/:id/box-score`)
Per player: points, FG, 3P and FT made/attempted, rebounds, assists, turnovers, fouls. Also a "not credited to a player" line and a team
total per side, so a side's total always equals its players plus that line. Totals come from the event log, never stored.

Visibility: public once the competition is published. Players appear by **jersey number**; **names** are added only for the team's members
and the competition's organizer (rosters are not public). A player later removed from the roster shows as "Former player".

The scorer gets the two rosters from `GET /api/v1/matches/:id/rosters` (scorers only); the web scorer caches them so it still works after a
reload without a connection. If rosters are missing, scoring works exactly as before.

## Game clock (step 1 of minutes played)
The web scorer has a countdown clock the scorer starts and stops by hand (period length 5/8/10/12 min, overtime 5 min; "Set clock" fixes it
after a stoppage). Its remaining seconds are stamped on every event as `match_events.clock_seconds` (the column already existed). The clock
lives on the scorer's device only (localStorage, per match) and stops itself at 0:00. Nothing reads `clock_seconds` for stats yet.

## Substitutions (step 2 of minutes played)
`match_events.player_out_id` (migration 0018, nullable, references `users`). A `SUBSTITUTION` event must name the player coming on
(`player_id`) and may name the player leaving (`player_out_id`); with no one leaving it declares a starter on court. Both must be on the
roster of the event's side, they cannot be the same person, and no other event type may carry `player_out_id` (422 otherwise). Subs never
change the score. A player who only came on from the bench appears in the box score with an empty line.
The scorer's "On court (n/5)" panel per team: tap the starters, then tap a bench player and the player they replace. The on-court lineup is
kept on the scorer's device (per match) and undo restores it. Two scorers do not share a lineup yet; the server only has the events.

Not built: minutes played itself (next: compute it from the sub and clock stamps; assumes each period runs to 0:00 unless a PERIOD_END says otherwise), plus-minus, shot locations, season or career totals, player pages, exporting stats.

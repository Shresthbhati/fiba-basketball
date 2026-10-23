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

Not built: minutes played / substitutions, plus-minus, shot locations, season or career totals, player pages, exporting stats.

# competitions

- `teams`: name, created_by (creator gets a COACH role scoped to the team).
- `competitions`: name, organizer_id, format ROUND_ROBIN | SINGLE_ELIMINATION, status DRAFT → PUBLISHED (when the schedule is generated) → COMPLETED (when every match is FINISHED/LOCKED; reopens if a correction changes that). Creator gets an ORGANIZER role scoped to the competition.
- `competition_teams`: registration with optional seed.
- `matches`: round, slot, home/away team (null until known), state SCHEDULED | LIVE | FINISHED | LOCKED, scores, forfeit, `is_bye`, next_match_id + next_side for bracket advancement.
- `match_result_log`: append-only; every entered or corrected result, who entered it, when.

- `match_protests`: formal match disputes under FIBA Rule C and Art. 44 (correctable errors). Tracks match_id, filing_team_id, protest_type (SCORE_DISCREPANCY, INELIGIBLE_PLAYER, REFEREE_RULE_MISAPPLICATION, CLOCK_OPERATOR_ERROR, OTHER), period, game_clock, rule_cited, description, status (FILED, UNDER_REVIEW, UPHELD, DISMISSED), deposit_verified, filed_at, decided_at.
- `protest_tribunal_rulings`: adjudication records issued by tournament disciplinary tribunal. Tracks protest_id, reviewer_id, referee_testimony, ruling (UPHELD, DISMISSED), remedy_action (NONE, SCORE_ADJUSTED, MATCH_FORFEITED, PERIOD_REPLAY_ORDERED), adjusted_home_score, adjusted_away_score, forfeit_winner_team_id, ruling_summary, decided_at.

API: `POST /api/v1/teams`, `POST /competitions`, `GET /competitions/:id` (drafts 404 unless you manage it), `POST /competitions/:id/teams`, `POST /competitions/:id/schedule`,
`GET /competitions/:id/matches|standings`, `POST /matches/:id/result|lock`.
- `POST /matches/:id/protests`: file formal match dispute (team coach/captain or competition organizer).
- `GET /matches/:id/protests`: list disputes filed for a match (with tribunal ruling records).
- `GET /competitions/:id/protests`: list all disputes filed across an entire competition (organizers and participating coaches).
- `POST /protests/:id/adjudicate`: convene tribunal and issue formal ruling (`competition:manage`). Atomic score updates adjust match state and standings if remedy is `SCORE_ADJUSTED` or `MATCH_FORFEITED`.
- `GET /matches/:id` (public once published, else 404): `{ id, competitionId, competitionName, round, slot, state, isBye, scheduledAt, home:{id,name}|null, away:{id,name}|null, homeScore, awayScore }`.
- `PATCH /matches/:id` `{ scheduledAt: ISO string | null }` (`competition:manage`, outsiders 404): sets/clears `matches.scheduled_at`; 409 for FINISHED, LOCKED and bye matches. The matches list also carries `scheduledAt`.
- `POST /matches/:id/forfeit` `{ winner: "home"|"away" }` (`competition:manage`): records winner 20-0 with `forfeit = true` through `recordResult` (audit log, bracket advancement, loser earns 0 table points). 409 for locked/bye matches or when the next round was already played.
- Scorekeepers/referees have only `match:score`: they can enter results but cannot reschedule or forfeit.
- Web: organizers set/clear times, enter or correct a final score, record a forfeit and lock a result from the competition page; everyone sees times on match cards.

Rules: no tied scores; a locked match cannot change; in a knockout a result cannot be changed once the next round has been played; byes finish automatically and advance;
forfeit losses earn 0 table points. Minors cannot create teams or competitions yet.
Not built yet: live event-by-event scoring (offline queue, conflicts), venue assignment and scheduling constraint checks, player rosters/eligibility, public SSE updates.

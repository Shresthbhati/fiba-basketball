# Competition rosters

`competition_rosters`: one row per player per competition — `(competition_id, user_id)` is the key, so a player is on at most one team
per competition; `(competition_id, team_id, jersey)` is unique, so jersey numbers are unique within a team (0–99).

Rules (enforced by the API, `competition/roster.ts`):
- The team must be registered in the competition. Players must already be members of the team.
- At most 15 players per team.
- **Under-18 players cannot be rostered yet.** They may be on the team (with guardian `MEDIA_USE` consent) but not in competitions; there is no consent kind for competition play yet.
- Team staff (coach / team manager) can edit while the competition is a DRAFT (registration open). After the schedule is published only the organizer can edit, until the competition is COMPLETED, when rosters are closed.
- Visibility: the team's members and the competition's organizer only. Everyone else gets 404. Rosters are not shown on the public competition page (names of players are not published).
- Every add / jersey change / removal is audited (`roster.added`, `roster.jersey_changed`, `roster.removed`); an added player gets an in-app `ADDED_TO_ROSTER` notification.

Not built: attributing scoring events to rostered players (match events still carry only the team side), player stats, a roster
snapshot frozen per match, eligibility checks beyond the above, public rosters, minors in competitions.

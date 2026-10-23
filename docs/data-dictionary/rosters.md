# Competition rosters

`competition_rosters`: one row per player per competition — `(competition_id, user_id)` is the key, so a player is on at most one team
per competition; `(competition_id, team_id, jersey)` is unique, so jersey numbers are unique within a team (0–99).

Rules (enforced by the API, `competition/roster.ts`):
- The team must be registered in the competition. Players must already be members of the team.
- At most 15 players per team.
- **Under-18 players need guardian consent.** A minor can be rostered only while an active guardian has granted `COMPETITION_PLAY` (409 otherwise), and they are left out of the "who can be added" list until then. If that consent is withdrawn (by the guardian or the minor), the minor is removed from the rosters of every competition that is not COMPLETED, audited as `roster.removed_consent_withdrawn`; finished competitions keep their rosters.
- Team staff (coach / team manager) can edit while the competition is a DRAFT (registration open). After the schedule is published only the organizer can edit, until the competition is COMPLETED, when rosters are closed.
- Visibility: the team's members and the competition's organizer only. Everyone else gets 404. Rosters are not shown on the public competition page (names of players are not published).
- Every add / jersey change / removal is audited (`roster.added`, `roster.jersey_changed`, `roster.removed`); an added player gets an in-app `ADDED_TO_ROSTER` notification.

Not built: attributing scoring events to rostered players (match events still carry only the team side), player stats, a roster
snapshot frozen per match, eligibility checks beyond the above, public rosters.

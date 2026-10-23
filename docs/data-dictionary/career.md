# Player record ("Record" page)

`GET /api/v1/me/career`, page `/career`. A player's own totals, per-game averages and a per-competition breakdown with recent games.

- **Private by construction:** the only endpoint is "mine" — there is no way to read another person's record, and no sharing. Anyone
  signed in sees only their own. Sharing/publishing a record is a product decision that has not been made (see Not built).
- **Official only:** built from matches that are FINISHED or LOCKED. Games in progress or reopened do not count until final again.
- **What counts:** events the scorekeeper credited to the player (so it depends on rosters + player credit). A game counts if at least one
  credited event survives; corrected events are ignored, exactly as in the box score. Averages are per game counted.
- Computed from the event log on request (nothing is stored), so a correction or reopened match changes the record immediately.

Not built: sharing or public profiles, season filters, minutes, plus-minus, per-position stats, under-18 players (they cannot be
rostered yet), records for pickup games or training, export.

# Game film

| Table | Purpose |
|---|---|
| `film_games` | A game's film for one team: title, opponent, date, video status (`NONE`/`READY`), storage key, type, size. Visible only to members of `team_id`. |
| `film_clips` | A time range in a game (`start_ms`, `end_ms`, at most 10 minutes) with normalised lowercase tags (max 10) and an optional note. |

Team membership is not a table: it is a `role_assignments` row scoped to `resource_type='team'` (`COACH` or `PLAYER`).
Actions `team:view` and `film:manage` ignore global grants (everyone has a global PLAYER role).

Not modelled yet: video-to-scorebook time sync (VideoTimeMap), player tagging in clips, saved searches, reports.

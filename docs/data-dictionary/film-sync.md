# Film ↔ scorebook sync

Goal: click an official scoring event and the game film jumps to that moment.

## How it works
- The scorer stamps every event with the time the tap happened on the device (`match_events.occurred_at`). The server keeps it only
  if it is within 48 hours before to 10 minutes after the server's clock (a wrong device clock never blocks scoring; the time is just dropped).
- A coach links a film game to an official match their team played in (`film_games.match_id`) and gives one or more **sync points**
  (`film_sync_points`, up to 20): "this basket happened at this position in the video". Each other event is placed by real elapsed
  time from the **nearest sync point in time**: `video position = point position + (event time − point event time)`. Re-sending the
  same event replaces its position; points can be removed; relinking or unlinking clears them.
- `GET /api/v1/film/games/:id/timeline` returns the match's events with their video positions and the running score. Corrected events
  and corrections are left out. Events with no recorded time are counted (`untimed`) but not shown. Events that fall before the video
  starts have no position and are not listed.
- Visibility is the film's: team members only (others get 404). Jersey numbers are shown for both sides; **names only for the film
  team's own side**. Linking and syncing are staff-only. Relinking clears the sync point.

## Limits you should know about
- Between two sync points it assumes the film runs in real time alongside the scorer. If the camera was paused or the video edited,
  add a sync point after the pause (e.g. one per half) so only the events near the cut are affected. Events close to a point are
  as accurate as that point.
- Events scored before this feature, or by clients that don't send a time, can't be placed.
- The scorer's clock and the video's clock only need to agree through the sync point, so the device clock being a little off is fine.

Not built: automatic sync suggestions, clips created from timeline events, jump-to-event from the box score.

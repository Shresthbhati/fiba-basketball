# Film ↔ scorebook sync

Goal: click an official scoring event and the game film jumps to that moment.

## How it works
- The scorer stamps every event with the time the tap happened on the device (`match_events.occurred_at`). The server keeps it only
  if it is within 48 hours before to 10 minutes after the server's clock (a wrong device clock never blocks scoring; the time is just dropped).
- A coach links a film game to an official match their team played in (`film_games.match_id`) and gives **one sync point**: "this
  basket happened at this position in the video" (`sync_event_id`, `sync_video_ms`). Every other event is placed by real elapsed
  time: `video position = sync position + (event time − sync event time)`.
- `GET /api/v1/film/games/:id/timeline` returns the match's events with their video positions and the running score. Corrected events
  and corrections are left out. Events with no recorded time are counted (`untimed`) but not shown. Events that fall before the video
  starts have no position and are not listed.
- Visibility is the film's: team members only (others get 404). Jersey numbers are shown for both sides; **names only for the film
  team's own side**. Linking and syncing are staff-only. Relinking clears the sync point.

## Limits you should know about
- It assumes the film runs continuously in real time alongside the scorer. If the camera was paused or the video was edited
  (cuts, halftime removed) positions after that point will be off. There is a single sync point, no per-period anchors yet.
- Events scored before this feature, or by clients that don't send a time, can't be placed.
- The scorer's clock and the video's clock only need to agree through the sync point, so the device clock being a little off is fine.

Not built: multiple sync points (per period), automatic sync suggestions, clips created from timeline events, jump-to-event from the box score.

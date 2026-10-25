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

## Automated Event-to-Clip Segmentation & Highlight Reels (Spec §6.2, §6.4)
When a film game is linked to an official match and has at least one valid sync point (`timeline.synced === true`):

### 1. Auto-Clip Generator
- `POST /api/v1/film/games/:id/auto-clip`
  - Parameters:
    - `category`: `ALL_SCORING` | `THREE_POINTERS` | `ASSISTS` | `TURNOVERS` | `REBOUNDS` | `FOULS` | `CUSTOM`
    - `eventTypes`: array of explicit `EventType` strings (when `category === "CUSTOM"`)
    - `playerId`: UUID of target player (optional)
    - `sideFilter`: `OUR_TEAM` | `OPPONENT` | `BOTH` (default `OUR_TEAM`)
    - `leadSeconds`: Pre-roll buffer in seconds (default 4s, bounds 1–15s)
    - `lagSeconds`: Post-roll buffer in seconds (default 2s, bounds 1–10s)
    - `maxClips`: Maximum clips to generate (default 40, max 100)
  - Timing: calculates `startMs = max(0, videoMs - leadSeconds * 1000)` and `endMs = videoMs + lagSeconds * 1000`.
  - Duplicate detection: skips events if a clip already exists within 2 seconds.
  - Automatically tags: `auto-clip`, event type, period, jersey number, and descriptive score/opponent notes.
  - Negative authZ: non-members receive RFC 9457 `404 Not Found`.

### 2. Auto-Montage Highlight Reel
- `POST /api/v1/film/games/:id/auto-montage`
  - Parameters:
    - `title`: string (optional, defaults to "Game Highlights: {game.title}")
    - `description`: string (optional)
    - `category`: AutoClipCategory
    - `playerId`: target player UUID (optional)
    - `clipIds`: array of clip UUIDs (if omitted, auto-generates/selects matching clips)
    - `leadSeconds`, `lagSeconds`: timing parameters
  - Assembles clips into a structured `scouting_montages` playlist with ordered items and `totalDurationMs`.
  - Retrievable via `GET /api/v1/film/montages/:id`.


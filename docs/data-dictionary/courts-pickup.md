# courts and pickup

- `courts`: name, lat, lng, indoor, surface, hoops, lit, access_notes, verification_status (UNVERIFIED → COMMUNITY_CONFIRMED / FACILITY_VERIFIED / MODERATOR_VERIFIED), created_by.
- `court_reports`: CLOSED | UNSAFE | WRONG_INFO | OTHER, optional note.
- `pickup_games`: host, court, title, starts_at, ends_at, capacity (2–30), skill_band (self-declared), stored status OPEN | CANCELLED | COMPLETED, host_confirmed_at.
- `pickup_participants`: (game, user) status CONFIRMED | WAITLIST | CANCELLED, joined_at, checked_in_at.

Derived `phase` (never stored): OPEN, FULL, IN_PROGRESS, UNCONFIRMED (past end time, host hasn't confirmed), COMPLETED, CANCELLED.
Time alone never completes a game; only the host's explicit confirmation does.

API: `GET /api/v1/courts/nearby?lat&lng&radius_m&indoor`, `GET|POST /courts`, `POST /courts/:id/reports`, `POST /courts/:id/verification` (moderator);
`GET|POST /api/v1/pickup`, `GET /pickup/:id`, `POST|DELETE /pickup/:id/rsvp`, `POST /pickup/:id/check-in|complete|cancel`.

Rules: waitlist promotes in join order when a confirmed player cancels; check-in opens 30 min before start; roster names visible only to people in the game;
under-18 accounts cannot host or join public games until guardian consent exists.
Not built yet: invite-only/private games, recurring runs, live SSE capacity updates, activity history aggregates, notifications.

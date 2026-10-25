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

## Facility Operations & Court Reservation OS (Spec §8.3, §23.1)
- `facility_claims`: `court_id`, `operator_id`, `business_name`, `contact_email`, `contact_phone`, `status` (`PENDING | APPROVED | REJECTED`), `verified_at`. On approval, court transitions to `FACILITY_VERIFIED` and operator receives `VENUE_MANAGER` role.
- `court_operating_hours`: `court_id`, `day_of_week` (0–6), `open_time`, `close_time`, `slot_duration_minutes`, `hourly_rate_cents`, `currency`, `is_closed`. Configurable by venue manager, public read.
- `court_reservations`: `court_id`, `booked_by_id`, `start_time`, `end_time`, `purpose` (`LEAGUE_MATCH | TEAM_PRACTICE | PICKUP_RUN | TRAINING | COMMUNITY_EVENT | OTHER`), `status` (`CONFIRMED | CANCELLED`), `total_price_cents`, `notes`. Strict time overlap collision prevention; privacy filters conceal booker identity and notes for public queries while showing full details to manager.
- `court_maintenance_logs`: `court_id`, `logged_by_id`, `category` (`SURFACE_RESURFACING | RIM_REPLACEMENT | NET_REPLACEMENT | BACKBOARD_INSPECTION | LIGHTING_REPAIR | COURT_STRIPING | GENERAL_CLEANING | SAFETY_AUDIT`), `description`, `severity` (`ROUTINE | RECOMMENDED | URGENT_SAFETY_HAZARD`), `cost_cents`, `performed_at`, `next_inspection_due`. Publicly readable for player court safety transparency.
- Facility Analytics: computes 14-day utilization rate (% of operating hours booked), revenue totals, maintenance spend, urgent hazard flags, and purpose breakdown.
- API endpoints:
  - `POST /api/v1/courts/:id/claims` (submit claim)
  - `GET /api/v1/courts/:id/facility-status` (claim status & manager badge)
  - `GET|PUT /api/v1/courts/:id/operating-hours` (weekly schedule & slot pricing)
  - `GET|POST /api/v1/courts/:id/reservations` (privacy-preserved slot listing / booking)
  - `POST /api/v1/reservations/:id/cancel` (cancel reservation)
  - `GET|POST /api/v1/courts/:id/maintenance` (safety inspection & repair logs)
  - `GET /api/v1/courts/:id/facility-analytics` (venue manager utilization metrics)

## Court Photo Gallery & Community Verification Engine (Spec §8.1, §8.3, WP-1.11, WP-2.5)
- `court_photos`: `id` (UUIDv7), `court_id`, `user_id`, `url`, `caption`, `is_primary` (boolean), `status` (`ACTIVE | HIDDEN | FLAGGED`), `created_at`, `updated_at`. Enables visual proof of rim condition, court surface, chain nets, and lighting.
- `court_verifications`: `id` (UUIDv7), `court_id`, `user_id` (unique per court per user), `confirmed_surface`, `confirmed_hoops`, `confirmed_lit`, `confirmed_indoor`, `notes`, `created_at`.
- Community Consensus & Promotion: When total distinct community verifications reach $\ge 3$, the court is automatically promoted from `UNVERIFIED` to `COMMUNITY_CONFIRMED`.
- API endpoints:
  - `GET /api/v1/courts/:id/photos` (list photos with uploader display names)
  - `POST /api/v1/courts/:id/photos` (upload court photo; optionally designate as primary)
  - `DELETE /api/v1/courts/:id/photos/:photoId` (delete photo: owner or platform admin)
  - `POST /api/v1/courts/:id/photos/:photoId/primary` (set primary cover photo)
  - `GET /api/v1/courts/:id/verifications` (verification consensus breakdown, counts, and recent entries)
  - `POST /api/v1/courts/:id/confirm-attributes` (submit or update user attribute verification; auto-promotes to `COMMUNITY_CONFIRMED` upon reaching threshold)


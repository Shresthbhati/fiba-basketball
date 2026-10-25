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


## Pickup to Team/League Pathway & Direct Scouting Invites (Spec §8.4, §11.4, WP-5.5)
- `pickup_recruitment_invites`:
  - `id`: UUIDv7 PK
  - `pickup_game_id`: UUID references `pickup_games.id` (cascades on delete)
  - `coach_id`: UUID references `users.id` (cascades on delete)
  - `athlete_id`: UUID references `users.id` (cascades on delete)
  - `team_id`: UUID references `teams.id` (cascades on delete)
  - `status`: `PENDING | ACCEPTED | DECLINED | EXPIRED` (default `PENDING`)
  - `invite_type`: `TRYOUT | ROSTER_SPOT | DEVELOPMENT_SQUAD` (default `TRYOUT`)
  - `message`: text (scouting note and tryout instructions, min 5 chars)
  - `tryout_date`: timestamp with timezone (optional scheduled date for tryout session)
  - `location`: text (optional facility name or address)
  - `expires_at`: timestamp with timezone (default 14 days, max 30 days)
  - `responded_at`: timestamp with timezone (recorded on accept or decline)
  - `created_at`: timestamp with timezone
- Indexes: `(athlete_id, status)`, `(coach_id)`, `(pickup_game_id)`, `(team_id)`.
- Pathway Mechanics:
  - Coaches, team managers, and scouts watching or participating in pickup games can scout participants who had confirmed attendance in the run.
  - Negative AuthZ (ADR-0010): Only authorized coaches/managers of the recruiting team can issue invitations (unauthorized callers get 404). Outsiders cannot read athlete invitations or team outgoing queues (returns 404).
  - Mutual Consent: Direct invitations require explicit acceptance by the athlete.
  - Automatic Roster Enrolment: Upon acceptance, the athlete is automatically inserted into `role_assignments` with role `PLAYER`, resourceType `team`, and resourceId `team_id`, with notification and audit logging.
- API Endpoints:
  - `POST /api/v1/pickup/:id/scout-invites` (coach sends recruitment invite to a confirmed pickup participant)
  - `GET /api/v1/pickup/:id/scouting-roster` (lists participants with team invite statuses for coaching staff)
  - `GET /api/v1/recruitment/invites` (athlete inbox for incoming scouting invitations, filterable by status)
  - `GET /api/v1/recruitment/invites/:id` (single invite details: athlete or coach only)
  - `POST /api/v1/recruitment/invites/:id/accept` (athlete accepts invite; automatically enrols player onto team roster)
  - `POST /api/v1/recruitment/invites/:id/decline` (athlete declines invite)
  - `GET /api/v1/teams/:teamId/recruitment-invites` (lists outgoing recruitment invites for team coaches)


## 5. Commercial Sponsor & Facility Analytics with k-Anonymity Guardrails (WP-8.6, Spec §8.6, §23, §24.2)
- Database Tables:
  - `sponsor_profiles`:
    - `id`: UUID (v7 / uuid default)
    - `user_id`: UUID references `users.id` (cascades on delete)
    - `company_name`: text (organization or commercial brand name)
    - `contact_email`: text (official corporate contact)
    - `brand_category`: text (`APPAREL | FOOTWEAR | BEVERAGES | NUTRITION | EQUIPMENT | MEDIA | TECHNOLOGY | COMMUNITY | OTHER`)
    - `website_url`: text nullable
    - `status`: `PENDING | ACTIVE | SUSPENDED` (default `ACTIVE`)
    - `created_at`: timestamp with timezone
    - `updated_at`: timestamp with timezone
    - Unique index: `(user_id)`
    - Indexes: `(status)`, `(brand_category)`
  - `sponsor_analytics_grants`:
    - `id`: UUID
    - `sponsor_id`: UUID references `sponsor_profiles.id` (cascades on delete)
    - `court_id`: UUID references `courts.id` (cascades on delete, nullable)
    - `competition_id`: UUID references `competitions.id` (cascades on delete, nullable)
    - `scope`: `COURT | COMPETITION | GLOBAL` (default `COURT`)
    - `granted_by`: UUID references `users.id` (court venue manager, tournament organizer, or platform admin)
    - `expires_at`: timestamp with timezone (nullable)
    - `created_at`: timestamp with timezone
    - Indexes: `(sponsor_id)`, `(court_id)`, `(competition_id)`
  - `sponsor_report_queries`:
    - `id`: UUID
    - `sponsor_id`: UUID references `sponsor_profiles.id` (nullable, set null on delete)
    - `queried_by`: UUID references `users.id`
    - `query_type`: `COURT_ANALYTICS | COMPETITION_ANALYTICS | FACILITY_OVERVIEW`
    - `resource_id`: UUID
    - `k_threshold`: integer (default 5, strictly $\ge 5$)
    - `suppressed_buckets`: integer (number of cohorts masked for privacy)
    - `created_at`: timestamp with timezone
    - Indexes: `(queried_by, created_at)`, `(resource_id, query_type)`
- Privacy & $k$-Anonymity Guarantees:
  - $k$-Anonymity Standard ($k \ge 5$): Any demographic sub-cohort (e.g., age bracket, skill band, hourly attendance) with fewer than 5 unique participants is automatically suppressed and masked as `< 5 (Suppressed for Privacy)`.
  - Blanket Demographic Suppression: If the total unique participants utilizing a court or participating in a tournament is $< 5$, all demographic breakdowns are completely suppressed to eliminate individual or minor re-identification risk.
  - Minor Protection (Spec §24.2): Minor demographic data is never isolated in sub-cohorts smaller than $k=5$.
  - Negative AuthZ (ADR-0010): Non-existent resources, unauthorized users, or revoked/expired grants return RFC 9457 `404 Not Found`.
  - Non-Diagnostic Bounding (ADR-0009): Zero injury prediction, fatigue forecasting, or medical diagnostic claims.
- API Endpoints:
  - `POST /api/v1/sponsors/profile`: Registers or updates sponsor organization profile (automatically assigns `SPONSOR` role).
  - `GET /api/v1/sponsors/me`: Fetches authenticated user's sponsor profile and active access grants.
  - `POST /api/v1/sponsors/grants`: Issues an analytics grant to a verified sponsor profile for a specific court or tournament.
  - `GET /api/v1/sponsors/grants`: Lists active grants issued or received.
  - `DELETE /api/v1/sponsors/grants/:id`: Revokes an analytics grant immediately cutting off access.
  - `GET /api/v1/sponsors/analytics/courts/:id`: Retrieves aggregated footfall, demographic cohorts, and peak usage with $k \ge 5$ masking.
  - `GET /api/v1/sponsors/analytics/competitions/:id`: Retrieves tournament participation, rosters, and division demographics with $k \ge 5$ masking.
  - `GET /api/v1/sponsors/analytics/audit-log`: Retrieves recent query history and suppression audit trail.

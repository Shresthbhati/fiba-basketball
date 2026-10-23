# COURT IQ — Master Specification

> **Document Status:** Authoritative Product & System Specification  
> **Target Version:** 1.0 (Core Foundation & Staged Expansion)  
> **Architecture Decisions:** Locked in `docs/adr/` (ADR-0001 through ADR-0014)  
> **Operating Rules:** `AGENTS.md`  
> **Companion Guide:** `docs/product-vision/court-iq-product-guide.md`  
> **Implementation Tracking:** `docs/implementation-plan.md`  

---

## Table of Contents
1. [§1 Executive Summary & Platform Overview](#1-executive-summary--platform-overview)
2. [§2 Identity, Accounts, Profiles, Age Gate, Authentication & Roles](#2-identity-accounts-profiles-age-gate-authentication--roles)
3. [§3 Platform Data Provenance & Trust Model](#3-platform-data-provenance--trust-model)
4. [§4 Player Lab: Biomechanics & Movement Analysis](#4-player-lab-biomechanics--movement-analysis)
5. [§5 Strength & Conditioning OS & Athletic Testing](#5-strength--conditioning-os--athletic-testing)
6. [§6 Game Intelligence & Video Lab](#6-game-intelligence--video-lab)
7. [§7 Tactical Playbook & Simulation Lab](#7-tactical-playbook--simulation-lab)
8. [§8 Court Directory & Pickup Network](#8-court-directory--pickup-network)
9. [§9 Coach OS & Practice Planner](#9-coach-os--practice-planner)
10. [§10 Organizations, Venues & Competitions](#10-organizations-venues--competitions)
11. [§11 Athlete Career OS & Marketplace](#11-athlete-career-os--marketplace)
12. [§12 Advanced Tactical Analysis, Tracking & Evaluated ML](#12-advanced-tactical-analysis-tracking--evaluated-ml)
13. [§13 Authorization Engine & Security Model](#13-authorization-engine--security-model)
14. [§14 Consent Grants, Guardians & Minor Safeguards](#14-consent-grants-guardians--minor-safeguards)
15. [§15 Trust & Safety, Moderation Queue](#15-trust--safety-moderation-queue)
16. [§16 Live Match, Event Stream & Scorebook](#16-live-match-event-stream--scorebook)
17. [§17 Public Tournament Pages & Organizer Command Center](#17-public-tournament-pages--organizer-command-center)
18. [§18 Media Pipeline, Storage & Processing](#18-media-pipeline-storage--processing)
19. [§19 Verification Strategy & Critical E2E Journeys](#19-verification-strategy--critical-e2e-journeys)
20. [§20 Design System, Navigation & User Experience](#20-design-system-navigation--user-experience)
21. [§21 First-Release Scope & Deferred Frontier Capabilities](#21-first-release-scope--deferred-frontier-capabilities)
22. [§22 Real-Time Architecture & Distributed Sync](#22-real-time-architecture--distributed-sync)
23. [§23 Facility, Referee, Scout & Parent Workspaces](#23-facility-referee-scout--parent-workspaces)
24. [§24 Privacy, Compliance & Responsible AI Guardrails](#24-privacy-compliance--responsible-ai-guardrails)
25. [§25 Observability, Benchmarks & Disaster Recovery](#25-observability-benchmarks--disaster-recovery)
26. [§26 Acceptance Criteria Checklist & Definition of Done for Core Milestones](#26-acceptance-criteria-checklist--definition-of-done-for-core-milestones)

---

## 1. Executive Summary & Platform Overview

COURT IQ is a connected basketball operating system connecting players, coaches, strength-and-conditioning professionals, tournament organizers, referees, scorekeepers, facilities, scouts, parents/guardians, and local basketball communities into one unified, permission-controlled ecosystem.

The central feedback loop uniting the entire architecture is:
$$\text{RECORD} \longrightarrow \text{MEASURE} \longrightarrow \text{UNDERSTAND} \longrightarrow \text{PLAN} \longrightarrow \text{PRACTISE} \longrightarrow \text{COMPETE} \longrightarrow \text{VALIDATE} \longrightarrow \text{IMPROVE}$$

### 1.1 The Seven Product Pillars
1. **Player Lab:** Video-based camera assessment of supported basketball movements (shooting mechanics, jump takeoff, landing stability, countermovement jump, squat depth). Observations provide timestamped evidence and confidence metrics, strictly refraining from uncalibrated medical diagnosis.
2. **Strength & Conditioning OS:** Basketball-specific periodized programming (off-season, pre-season, in-season, tournament week), exercise logging (sets, reps, load, RPE, rest), standardized jump/sprint/conditioning testing protocols, and explainable, deterministic load suggestions with pain-related safety stops.
3. **Game Intelligence:** Game video storage, timeline synchronization with official scorebooks, possession and event annotation, searchable clip library, coach montages, and evidence-grounded tactical reports.
4. **Playbook & Tactical Simulation Lab:** Accurate 2D court rendering, diagram editor (passes, cuts, screens, dribbles, routes), deterministic animation (labeled diagrammatic, not predictive), drills, and practice plan integration.
5. **Court Network & Pickup:** Discovery of public/private courts by coordinates/radius (2–5 km presets or custom), host pickup runs, RSVP, waitlist auto-promotion, check-in, host completion confirmation, and aggregated privacy-preserving court activity history.
6. **Coach & Competition OS:** Rosters, team management, tournament division structures, custom rule-sets, bracket generation (round-robin, single elimination), real-time live scoring, transactional scorebook event logs, and official standings recalculations.
7. **Career OS:** Permission-controlled athlete passport featuring verified match performance statistics, verified achievements with issuer provenance, highlight reels, tryout discovery, and granular athlete-controlled sharing.

---

## 2. Identity, Accounts, Profiles, Age Gate, Authentication & Roles

### 2.1 User Accounts & Age Gating
- Every account stores: `id` (UUIDv7), `email` (unique, lowercase), `password_hash` (Argon2id), `display_name`, `date_of_birth` (ISO date), `is_minor` (boolean, derived as $< 18$ years on signup), `email_verified` (boolean), `email_notifications` (boolean), `created_at`, `updated_at`.
- **Age Gate Rule:** Users $< 13$ years of age are strictly rejected at signup. Users aged 13–17 are flagged as minors (`is_minor = true`) and require active guardian consent for public participation, media publication, and scout exposure.
- Password policy: minimum 8 characters; verified offline against breach heuristics; brute-force protection using rate limiting.

### 2.2 Authentication & Sessions
- Web and API operate behind a reverse proxy under `/api/v1`.
- Authentication uses secure, `httpOnly`, `SameSite=Lax`, `Secure` session cookies.
- CSRF protection: verified via origin checks against allowed hostnames.
- Email verification and password recovery use secure, single-use, expiring HMAC/random tokens delivered via transactional email.

### 2.3 Roles Hierarchy
Roles are granularly scoped per resource (`RoleAssignment(user_id, role, resource_type, resource_id, expires_at)`):
- `GUEST`: Implicit unauthenticated visitor.
- `PLAYER`: Athlete managing private training, pickup RSVP, and career passport.
- `COACH`: Team manager managing rosters, film reviews, tactical plays, and assigning athlete workouts.
- `SC_COACH`: Strength & conditioning professional designing templates and monitoring athlete workloads.
- `HEALTH_PRO`: Authorized medical/physio practitioner reviewing clinical recovery paths.
- `ORGANIZER`: Competition director creating tournaments, scheduling matches, and managing venues.
- `REFEREE`: Game official assigned to officiate matches and sign off results.
- `SCOREKEEPER`: Live match event operator with authorized scoring and offline queue capabilities.
- `VENUE_MANAGER`: Facility operator maintaining court listings, operating hours, and availability.
- `SCOUT`: Recruiter accessing athlete portfolios through explicit, revocable athlete consent grants.
- `GUARDIAN`: Parent or legal guardian with consent controls and visibility over a linked minor ward.
- `MODERATOR`: Trust & safety staff processing abuse reports and court verification requests.
- `PLATFORM_ADMIN`: System administrator overseeing audit logs and infrastructure governance.

---

## 3. Platform Data Provenance & Trust Model

Every metric, score, feedback item, and record in COURT IQ carries explicit provenance to prevent automated or unreviewed estimates from compromising official truth.

### 3.1 SourceType Taxonomy
1. `OFFICIAL`: Verified by an authorized official or certified competition scorekeeper (e.g. final match score, official fouls).
2. `SENSOR`: Measured by calibrated external hardware (e.g. force plate, electronic timing gate).
3. `CV_ESTIMATE`: Inferred via computer-vision pose or video processing models; requires model version, confidence score, and timestamped frame citations.
4. `COACH`: Formally entered or confirmed by a verified team coach or S&C specialist.
5. `SELF_REPORTED`: Provided directly by the athlete (e.g. logged gym load, wellness score, past playing experience).
6. `MODEL_INFERENCE`: Generated by predictive heuristics, tactical retrieval, or analytical models; strictly labeled as hypothesis or recommendation.

### 3.2 Auditability & Corrections
- No official score or verified event is silently overwritten or erased.
- Corrections are issued as compensating events (`CORRECTION`) with references to the target event, reason, and author identity.
- Audit logs are append-only; database constraints reject `UPDATE` or `DELETE` statements on audit tables.

---

## 4. Player Lab: Biomechanics & Movement Analysis

### 4.1 Scope of Biomechanical Assessment
The Player Lab delivers structured visual feedback for a bounded, evaluated movement catalog. It strictly refrains from making claims about internal tissue stress, bone density, or medical injury diagnosis.

### 4.2 Supported Movement Protocols
- **Countermovement Jump (CMJ):** Takeoff phase, flight duration, landing mechanics, and estimated vertical jump height under calibrated camera constraints.
- **Back Squat / Goblet Squat:** Repetition counter, eccentric phase, depth achievement relative to hip/knee crease rubric, torso lean angle, and concentric ascent consistency.
- **Shooting Form Assessment:** Shot preparation, set point, release angle, and follow-through consistency across video frames.
- **Landing Mechanics:** Bilateral symmetry on landing, knee valgus observations, and deceleration cadence.

### 4.3 Output Schema & Abstention
Assessments produce an `AssessmentResult`:
- `sourceType = CV_ESTIMATE`
- `model_version` & `protocol_version`
- `timestamped_observations`: list of keypoints, detected repetition phases, and metric values.
- `criteria_unmeasurable`: explicit list of parameters obscured or out of frame.
- `confidence`: statistical confidence score (0.0 to 1.0).
- `status`: `ACCEPTED`, `NEEDS_REVIEW`, or `ABSTAINED`.
- **Abstention Behavior:** If video resolution, lighting, camera angle, or occlusion prevents reliable assessment, the pipeline returns `ABSTAINED` with a clear explanation rather than generating speculative scores.

---

## 5. Strength & Conditioning OS & Athletic Testing

### 5.1 Exercise Library & Cues (§5.3 Category Taxonomy)
Every exercise in the library is versioned and tagged with:
- `category`: `STRENGTH`, `POWER`, `PLYOMETRIC`, `SPEED_AGILITY`, `CONDITIONING`, `MOBILITY`, `CORE`.
- `equipment`: Barbell, dumbbell, kettlebell, trap bar, bands, bodyweight, court, track, turf.
- `cues`: Standardized setup, concentric, eccentric, and breathing instructions.
- `safety_notes`: Joint-angle precautions and contraindication warnings.
- `reviewed`: Boolean indicator confirming whether a certified CSCS/physiotherapist has reviewed the record. Starter fixtures default to `reviewed = false`.

### 5.2 Workout Logging & Session Execution
- Sessions track: `started_at`, `ended_at`, `notes`, `session_rpe` (1–10).
- Sets track: `set_number`, `reps`, `load_kg`, `rpe` (1–10), `rest_seconds`, and a client-generated UUID `client_id` for offline idempotent submission.
- Mobile workout logger supports offline queue caching via client storage and graceful reconciliation on network recovery.

### 5.3 Deterministic Progression Engine
- Progression suggestions are explainable and purely deterministic (`src/training/progression.ts`).
- Minimum baseline: requires at least 2 logged sessions with recorded loads.
- `INCREASE`: Suggested only when every heaviest set in the last two workouts completed all target reps at $\text{RPE} \le 8$. Increase is capped at $2.5\%$ rounded to $1.25\text{ kg}$ (minimum $1.25\text{ kg}$, maximum $5\text{ kg}$).
- `HOLD`: Maintained when reps are met but RPE is high or missing.
- `DECREASE`: Suggested ($\sim 5\%$) only after two consecutive workouts failing to achieve target reps.
- **Safety Stop Rule:** Any wellness check reporting pain in the prior 7 days immediately pauses automatic progression, locking suggestions to `HOLD` with the advice: *"You reported pain. Training suggestions are paused. Please consider speaking to a qualified professional before continuing."*

### 5.4 Standardized Athletic Testing Protocols (§5.4–§5.9)
- Standing reach and jump height (calibrated Vertec or high-speed video flight-time).
- 10m/20m sprint times with gate calibration metadata.
- Pro-agility (5-10-5) and lane agility tests.
- Multi-stage fitness/shuttle conditioning benchmarks.

---

## 6. Game Intelligence & Video Lab

### 6.1 Video Ingestion & Byte-Range Streaming
- Supports upload of MP4, WebM, and MOV footage associated with team film games.
- Private media serving enforces team authorization and supports HTTP byte-range requests (`206 Partial Content`) for responsive timeline scrubbing.

### 6.2 Scorebook Timeline Synchronization
- Allows coaches and analysts to define sync anchor points linking video millisecond timestamps (`video_ms`) to official scorebook match events (`event_id`).
- Piecewise linear interpolation aligns all intervening match events across video playback.

### 6.3 Event Annotation & Taxonomy (§6.8 Taxonomy)
Standardized tags cover:
- **Possession Outcome:** Score, defensive stop, turnover, offensive rebound, foul.
- **Offensive Actions:** Pick-and-roll (ball handler / roller), horns, isolation, post-up, dribble handoff, cut, spot-up, transition.
- **Defensive Coverages:** Drop, switch, hedge, blitz, ice, zone (2-3, 3-2), full-court press.
- **Shot Context:** Catch-and-shoot, pull-up, floater, rim contest, open vs heavily contested.

### 6.4 Clip Management & Scouting Montages
- Clips store `start_ms`, `end_ms`, `tags`, and optional coach notes.
- Team-scoped search allows filtering by player jersey, action tag, period, and score differential.
- Evidence-linked scouting reports require every claim to cite specific clip IDs or official match events.

---

## 7. Tactical Playbook & Simulation Lab

### 7.1 2D Court Rendering Engine (§4.1)
- Standardized SVG/Canvas court renderer operating on standard coordinate space (origin at center court; metric dimensions aligned with FIBA 28m $\times$ 15m specifications).
- Half-court and full-court rendering modes.

### 7.2 Play Editor & Tactical Diagramming (§4.2)
- Authorable player tokens (1–5 offense, 1–5 defense), ball token, and movement paths.
- Action path types: Dribble (wave/zigzag), Cut/Run (solid arrow), Pass (dashed arrow), Screen (T-bar bar line), Defensive slide (double line).
- Keyframe timing steps to sequence tactical execution.

### 7.3 Simulation Ladder (§7.2–§7.5, §12)
1. **Level 1 (Diagrammatic Animation):** Authored route playback based strictly on keyframes. Formally labeled *"Diagrammatic illustration — not a predictive outcome"*.
2. **Level 2 (Video-Grounded Replay):** Coordinates extracted from real game video footage.
3. **Level 3 (Rule-Based Scenario Simulator):** Explores defensive coverage adjustments against offensive movements with explicit tactical rules.
4. **Level 4 (Evaluated Data-Driven Model):** Future research track utilizing machine learning models trained on held-out tracking datasets.

---

## 8. Court Directory & Pickup Network

### 8.1 Court Directory & Provenance (§8.3 Court Attributes)
- Stored attributes: `name`, `lat`, `lng`, `indoor` (boolean), `surface` (WOOD, CONCRETE, ASPHALT, TARTAN), `hoops` (integer), `lit` (boolean), `access_notes`, `verification_status`.
- Verification statuses: `UNVERIFIED` $\longrightarrow$ `COMMUNITY_CONFIRMED` $\longrightarrow$ `FACILITY_VERIFIED` $\longrightarrow$ `MODERATOR_VERIFIED`.
- Nearby search computes distance using bounding-box pre-filtering followed by Haversine distance, returning distances rounded to prevent exposing exact location trails.
- Location search defaults to user-selected coordinates; browser geolocation is accessed only upon explicit user tap.

### 8.2 Pickup Game Lifecycle
- Stored states: `OPEN` $\longrightarrow$ `CANCELLED` $\mid$ `COMPLETED`.
- Derived presentation phases: `OPEN`, `FULL`, `IN_PROGRESS`, `UNCONFIRMED`, `COMPLETED`, `CANCELLED`.
- **Explicit Completion Rule:** A game is never automatically completed by the clock. If the end time passes without confirmation, the phase becomes `UNCONFIRMED` until the host submits explicit attendance confirmation.
- Participation states: `CONFIRMED`, `WAITLIST`, `CANCELLED`.
- Cancellations by confirmed players trigger automatic waitlist promotion in chronological join order.
- Check-in window opens 30 minutes prior to scheduled start.
- Participant names are private to confirmed members of the game.

### 8.3 Recurring Runs (Pickup Series)
- Weekly recurrence schedule: `weekday` (0–6), local `start_time` ("HH:MM"), `duration_min`, IANA `timezone`, capacity, skill band.
- Materialization runs hourly, generating games 4 weeks ahead without duplicating existing dates or recreating cancelled occurrences.

---

## 9. Coach OS & Practice Planner

### 9.1 Team Roster & Role Assignments
- Teams contain verified members with roles: `HEAD_COACH`, `ASSISTANT_COACH`, `TEAM_MANAGER`, `PLAYER`.
- Roster assignments designate competition jersey numbers, verified positions, and active eligibility.

### 9.2 Practice Planner & Drill Management (§9.3)
- Practice sessions structured into sequenced blocks: Warm-up, Technical skill, Tactical system, Scrimmage, Cool-down / Video review.
- Practice drills linked directly to tactical playbook plays and game-film breakdowns.
- Player attendance and drill execution logs.

---

## 10. Organizations, Venues & Competitions

### 10.1 Competition Formats & RuleSets (§1.6)
- Formats supported: `ROUND_ROBIN`, `SINGLE_ELIMINATION`, `GROUPS_TO_PLAYOFFS`.
- Competitions store configurable `RuleSet` JSON: number of periods, period length in minutes, overtime length, fouls to penalty, timeouts per half, tie-breaker rules.
- Competitions carry the label *"Custom tournament rules — not an officially sanctioned FIBA competition"* unless authorized.

### 10.2 Scheduling Engine & Brackets (§1.7)
- Automated round-robin generation via circle method.
- Single elimination bracket seeding with bye allocation.
- Scheduling constraint engine detects venue availability conflicts, team rest window violations, and court overlap.
- Standings tables recalculate transactionally on match finalization or score correction.

---

## 11. Athlete Career OS & Marketplace

### 11.1 Athlete Passport & Field-Level Sharing (§11.1)
- Private career dashboard summarizing lifetime official stats: games played, points, FG%, 3P%, FT%, rebounds, assists, turnovers, minutes played.
- Granular sharing controls: Athlete can create expiring, read-only preview tokens granting selective access (e.g. game stats only, film clips only, S&C history excluded).

### 11.2 Verified Achievements & Opportunities (§11.2–§11.4)
- Achievements maintain cryptographic issuer signatures, evidence links, and revocation status.
- Opportunity board: Academies, tryouts, college clinics, and club showcases with verified eligibility criteria.
- Minors are strictly hidden from public recruiter and scout discovery lists by default.

---

## 12. Advanced Tactical Analysis, Tracking & Evaluated ML

- Gated capability: Initiated only when licensed, ground-truth labeled tracking footage is available.
- Opponent DNA Reports: Aggregated multi-game tendencies (pick-and-roll coverage response, transition shot distribution, late-clock shot selection).
- Every analytical claim must state sample size, confidence interval, and link to illustrative video clips.

---

## 13. Authorization Engine & Security Model

### 13.1 Centralized Authorization Service
- Every API endpoint enforces `AuthorizationService.can(actor, action, resourceRef)`.
- Unauthorized access attempts to private resources return `404 Not Found` rather than `403 Forbidden` to prevent resource enumeration and IDOR attacks.
- Negative authorization test suites verify unauthorized access, cross-tenant isolation, and revoked grant rejections.

---

## 14. Consent Grants, Guardians & Minor Safeguards

### 14.1 Guardian Relationships & Verification
- Minor accounts ($< 18$ years) can invite an adult guardian by email.
- The guardian must confirm their identity through a verified email token.
- Guardian consent is mandatory for a minor to participate in public pickup games, publish media, or make profile information visible to third parties.

### 14.2 Immediate Revocation
- Guardians or minors can revoke a consent grant or sharing grant at any time.
- Revocation takes effect immediately in the database and revokes subsequent access across all endpoints.

---

## 15. Trust & Safety, Moderation Queue

### 15.1 User Blocking, Muting & Reporting
- `block`: Two-way exclusion. Blocked users cannot see each other in participant lists, join the same pickup runs, or view private profiles.
- `mute`: One-way silence of notifications and interactions.
- `report`: Community reports against users, courts, or media. Repeat reports automatically aggregate into a prioritized `ModerationCase`.

### 15.2 Moderation Queue & Audit Logging
- Dedicated moderator endpoints to inspect cases, take actions (warn, suspend, remove content), and log resolution reasons.
- All moderator inspections and sensitive administrative reads require a logged reason and write append-only audit entries.

---

## 16. Live Match, Event Stream & Scorebook

### 16.1 Match Lifecycle State Machine
$$\text{SCHEDULED} \longrightarrow \text{LIVE} \longrightarrow \text{FINISHED} \longrightarrow \text{LOCKED}$$
Additional terminal/exceptional states: `POSTPONED`, `CANCELLED`, `FORFEITED`. State transitions are strictly validated in domain logic (`MatchState.canTransitionTo`).

### 16.2 Event Sourcing & Batch Ingestion
- Live scorekeeper logs atomic batches of `MatchEvent`s: made/missed field goals, three-pointers, free throws, rebounds, assists, turnovers, personal/technical fouls, timeouts, substitutions, clock adjustments, and corrections.
- Scorekeeper device generates local monotonic sequence numbers (`localSeq`) and UUIDs for idempotent ingestion.
- Base-version concurrency check: Divergent state returns `409 Conflict` containing the current server state, allowing the scorekeeper interface to reconcile and re-submit.

### 16.3 Real-Time Match State Projection
- Live score, team fouls, player box scores, and remaining game clock are calculated on the fly from the validated event sequence.
- Live updates stream to spectators via Server-Sent Events (SSE).

---

## 17. Public Tournament Pages & Organizer Command Center

### 17.1 Organizer Command Center
- Real-time tournament grid monitoring multiple courts simultaneously.
- Identifies game delays, missing scorekeepers, unconfirmed scores, and protest flags.
- Delay simulation: Preview the downstream schedule impact of delaying a match before committing the change.

### 17.2 Public Competition Site
- Responsive, publicly accessible fixture lists, live scoreboards, tournament brackets, and standings tables.
- Roster player jersey numbers are publicly visible; real player names and personal profiles remain protected based on participant privacy settings.

---

## 18. Media Pipeline, Storage & Processing

### 18.1 Media Storage Abstraction
- Defined by `MediaStorage` interface (`save`, `get`, `delete`, `getUrl`).
- Local filesystem storage adapter (`LocalDiskStorage`) used in development and embedded testing.
- Production adapter targets S3-compatible object storage (e.g. MinIO, AWS S3, Cloudflare R2) using presigned upload intents.

### 18.2 Ingestion & Processing Pipeline
- Pre-upload validation: File size limits ($500\text{ MB}$ default), duration caps, and MIME validation (`video/mp4`, `video/webm`, `video/quicktime`).
- Background job processor: Transcoding to 720p H.264 web proxies, automated thumbnail generation, and clip extraction.

---

## 19. Verification Strategy & Critical E2E Journeys

### 19.1 Testing Pyramid
- **Unit Tests:** Deterministic business logic, progression algorithms, bracket generators, and box score calculations.
- **Integration Tests:** Database transactions, migration execution, and schema validation via embedded PGlite.
- **Contract Tests:** Frontend-to-backend API response shape validation.
- **E2E Tests:** Playwright browser automation verifying complete user journeys.

### 19.2 The Four Critical End-to-End Journeys (§19.4)
1. **Tournament Operations Journey:** Create tournament $\longrightarrow$ register teams $\longrightarrow$ schedule round-robin fixtures $\longrightarrow$ execute live scoring $\longrightarrow$ perform score correction $\longrightarrow$ finalize game $\longrightarrow$ verify standings update on public site.
2. **Pickup Network Journey:** Search courts by radius $\longrightarrow$ host pickup game $\longrightarrow$ players RSVP to capacity $\longrightarrow$ waitlist auto-promotion upon cancellation $\longrightarrow$ player check-in $\longrightarrow$ explicit host completion confirmation.
3. **Training & Safety Journey:** Create athlete workout $\longrightarrow$ log exercise sets with reps/load/RPE $\longrightarrow$ verify progression suggestions $\longrightarrow$ submit pain report $\longrightarrow$ verify immediate progression pause $\longrightarrow$ coach reviews workout logs.
4. **Game Film & Sync Journey:** Upload game film $\longrightarrow$ link film to official match $\longrightarrow$ set synchronization anchors $\longrightarrow$ verify scorebook timeline alignment $\longrightarrow$ tag clips $\longrightarrow$ verify team-only access control.

---

## 20. Design System, Navigation & User Experience

### 20.1 Visual Design Tokens
- Canvas: Deep charcoal / near-black surfaces (`#0a0a0c`, `#141418`, `#1c1c22`).
- Accents: Basketball court orange (`#f97316`) used with high contrast.
- Typography: Clean athletic sans-serif with tabular numerals for clocks, scores, and weights.
- Accessibility: WCAG AA contrast compliance across light and dark viewports; full `prefers-reduced-motion` compliance.

### 20.2 Role-Aware Workspaces
- Navigation dynamically presents relevant options based on active role:
  - **Athlete:** Home, Train, Pickup & Courts, Game Film, Career Passport.
  - **Coach:** Team Roster, Practice Planner, Tactical Playbook, Film Room, Player Progress.
  - **Organizer:** Tournaments, Scheduling, Command Center, Scorekeeping, Venues.

---

## 21. First-Release Scope & Deferred Frontier Capabilities

### 21.1 Included in Release 1.0 (Core Foundation)
- Complete identity, authentication, age gating, guardian consent, and block/report moderation.
- Full competition management, bracket generation, live scorekeeping, and standings calculation.
- Court directory nearby search and complete pickup game operations with waitlists.
- S&C workout logging, exercise library, offline draft set queues, and deterministic progression suggestions.
- Game film upload, byte-range playback, scorebook timeline sync, and clip management.
- Private career statistics summary.

### 21.2 Explicitly Deferred Capabilities
- Computer-vision multi-player automated tracking from uncalibrated spectator video.
- Automated tactical digital twin / multi-agent simulation.
- Unvalidated injury prediction or medical diagnostic scoring.
- Universal single "Basketball IQ" score.
- Native mobile app wrapper prior to proving responsive web/PWA workflows.

---

## 22. Real-Time Architecture & Distributed Sync

### 22.1 Real-Time Event Streaming
- Server-Sent Events (`/api/v1/streams/*`) stream live updates with typed envelopes: `{ id, schemaVersion, resourceId, resourceVersion, occurredAt, type, data }`.
- Reconnection Protocol: Clients pass last received event ID; if client state is stale, the client refetches authoritative state from the REST endpoint.

### 22.2 Horizontal Scaling Migration
- Single-instance deployments utilize the in-process event bus (`services/api/src/match/bus.ts`).
- Multi-instance deployments require Redis Pub/Sub fan-out to synchronize events across instances without data loss.

---

## 23. Facility, Referee, Scout & Parent Workspaces

- **Facility Operators:** Manage court listings, surface maintenance records, operating hours, and booking rules.
- **Referees:** Access assigned matches, digital pre-game checklists, rule-set summaries, and official match sign-off.
- **Scouts & Recruiters:** Search athletes with active talent-passport sharing grants; direct access to verified game video and verified achievements.
- **Parents & Guardians:** Manage youth consent grants, review scheduled pickup games and tournament matches, and monitor athlete safety.

---

## 24. Privacy, Compliance & Responsible AI Guardrails

1. **No Exact Location Exposure:** Geolocation queries calculate rounded distances. Personal live locations or home addresses are never exposed.
2. **Health Data Isolation:** Athlete pain notes and recovery metrics are classified as sensitive personal data, isolated from public team statistics.
3. **No Medical Diagnostics:** Visual movement assessments are strictly movement pattern observations with uncertainty bounds.
4. **Data Retention & Right to Erasure:** Athletes can export their full data archive or trigger account deletion with cascade cleanup of personal media.

---

## 25. Observability, Benchmarks & Disaster Recovery

### 25.1 System Observability
- JSON structured logging with mandatory `X-Request-Id` correlation across API and client requests.
- Health check endpoints (`/health` and `/ready`) monitoring database connectivity and storage status.
- Key metrics: HTTP request latency, error rates, score event sync latency, and background job queue depth.

### 25.2 Disaster Recovery & Drills
- Nightly automated PostgreSQL logical backups (`pg_dump`).
- Scripted restore drill (`scripts/restore-test.sh` / `docs/operations/backup-restore.md`) verifying schema integrity and table row counts.

---

## 26. Acceptance Criteria Checklist & Definition of Done for Core Milestones

A work package or feature is declared **DONE** only when all applicable criteria are satisfied:

- [ ] **Specified:** Requirement, user journey, and acceptance criteria documented in this specification.
- [ ] **Implemented:** Production-quality TypeScript/Next.js/SQL code written and committed.
- [ ] **Unit Tested:** Pure domain algorithms verified by unit tests.
- [ ] **Integration Tested:** Database migrations, persistence, and external adapters verified via test suite.
- [ ] **Contract Tested:** API client and web screen schema compatibility validated.
- [ ] **AuthZ Enforced:** All sensitive endpoints call `AuthorizationService.can(...)`; negative authZ tests prove unauthorized requests return 404.
- [ ] **UI States Complete:** All screens implement Loading, Empty, Error, and Offline states.
- [ ] **CI Green:** Automated test suite passes cleanly with zero lint, type, or test errors.
- [ ] **Documentation Updated:** Data dictionary and implementation plan updated to reflect the new functionality.

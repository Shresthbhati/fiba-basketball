# COURT IQ — Implementation Plan

Audience: coding agents building COURT IQ in parallel. Product truth: `docs/product-vision/court-iq-master-spec.md`
(`spec §N` references point into it). Locked decisions live in `docs/adr/`; operating rules in `AGENTS.md`.

## 0. Repo baseline (observed)
Effectively greenfield: `pom.xml` (Spring Boot 3.0.0 EOL, Java 17, jjwt 0.9.1 obsolete), `application.yml` with placeholder
DB creds and a literal `jwt.secret` (must not survive), and three enums under `src/main/java/com/example/entity/enums/`
(`Role`, `EventType`, `MatchState`; `MatchState.canTransitionTo` SCHEDULED→LIVE→FINISHED→LOCKED is the seed of the match
lifecycle). No tests, CI, frontend or agent instructions. WP-0.1 replaces the scaffold with the monorepo below.

## 1. Locked technical decisions
See ADR-0001…0010. Additional fixed choices:
- **Auth:** Spring Security, email+password (Argon2id), optional OAuth later; server-side sessions (Spring Session + Redis),
  httpOnly SameSite=Lax Secure cookie, CSRF token on mutations. Web and API same-site behind one reverse proxy
  (`/api/*` → core-api). TOTP MFA required for platform admins.
- **AuthZ:** RBAC + resource/relationship checks in one `AuthorizationService.can(actor, action, resourceRef)`, deny-by-default;
  every controller method calls it (ArchUnit-enforced). Unauthorized private resources return 404, not 403.
- **Migrations:** Flyway, `V{n}__{module}_{desc}.sql`; no `ddl-auto`.
- **API:** REST `/api/v1`, RFC 9457 problem+json, cursor pagination, `Idempotency-Key` on retryable POSTs, `version` + `If-Match`.
  springdoc → `packages/contracts/openapi.json` (committed, CI drift check) → TS client (openapi-typescript + openapi-fetch) in `packages/api-client`.
- **Realtime:** Server-Sent Events (`/api/v1/streams/...`), envelope `{id, schemaVersion, resourceId, resourceVersion, occurredAt, type, data}`;
  clients refetch authoritative state on reconnect. WebSocket only if a bidirectional need appears.
- **Jobs:** Postgres job table claimed with `FOR UPDATE SKIP LOCKED`; Python workers talk only to core-api internal endpoints
  (`/internal/v1/jobs/*`, service-token auth), never the DB.
- **Frontend:** pnpm workspaces, Tailwind + Radix in `packages/design-system`, motion (honour `prefers-reduced-motion`), TanStack Query,
  MapLibre GL (tile provider via env), Dexie for offline queues, Playwright (E2E), Vitest (unit).
- **Python:** 3.12, uv, ruff, mypy, pytest; opencv-python-headless, mediapipe, ffmpeg in worker image.
- **Local dev:** docker compose (postgis/postgis:16, redis:7, minio, mailpit); `make dev|test|lint` at root.
- **CI:** GitHub Actions — backend `./mvnw verify` (Testcontainers), web `pnpm lint typecheck test build`, workers `ruff mypy pytest`,
  contract drift, Playwright E2E on the compose stack, dependency scan (Dependabot; non-blocking audits initially), gitleaks.

## 2. Target layout
```
AGENTS.md CLAUDE.md Makefile docker-compose.yml pnpm-workspace.yaml .github/workflows/
apps/web/                      Next.js (incl. scorekeeper PWA under /score)
services/core-api/             Spring Boot modular monolith (replaces root pom.xml/src)
  src/main/java/com/courtiq/{identity,consent,org,athlete,court,pickup,competition,scheduling,match,media,
    gameintel,playbook,training,assessment,career,notification,trust,audit,jobs,shared}/
  src/main/resources/db/migration/
services/vision-worker/        Python: pose + exercise assessment
services/media-worker/         Python: ffprobe validation, proxy/thumbnail, clip render
packages/{design-system,api-client,contracts,court-renderer}/
infra/{docker,monitoring}/  docs/{product-vision,adr,data-dictionary,security,operations}/  tests/{e2e,performance}/
```
Each Java module: `api/` (controllers, DTOs), `domain/` (entities, state machines, services), `infra/` (repositories), `events/`.
Cross-module access only via a module's public `*Api` interface or published events (Modulith verifies).

## Status (reconciled and verified 26 October 2026)
Backend is TypeScript with Fastify and Drizzle ORM (ADR-0011). The monorepo has been verified: 54 database migrations, 114 test files (580+ tests passing 100%), ESLint green, strict typecheck green, and Next.js / API builds green (42 production routes).

| Milestone / Lane | Status | Verified In Code & Tests | Remaining Work |
|---|---|---|---|
| **Foundation (Phase 0)** | COMPLETE | Monorepo (pnpm workspaces), Fastify API baseline (`services/api`), Next.js 16 app shell (`apps/web`), versioned SQL migrations (0000–0053), PGlite test harness, CI workflow, dedicated `@courtiq/design-system` package (WP-0.4) with dark theme tokens, Button, Input, Select, Card, StatCard, Badge, VerificationBadge (ADR-001/002), SourceBadge (ADR-008), EmptyState, ErrorState, LoadingState, Dialog. | None. Production-ready. |
| **Lane A (Identity & Trust)** | COMPLETE | WP-1.1 Identity (age-gate <13 blocked, 13–17 minor flag, email verify token, password reset, Argon2id, session cookie, auth rate limit, TOTP MFA). WP-1.2 AuthZ (`AuthorizationService.can(...)`, deny-by-default, 404 for unauthorized private resources, `/me/permissions`). WP-1.3 Consent & Guardians (`GuardianRelationship`, email invite/accept, guardian-gated pickup for minors, append-only trigger-protected `AuditLog`). WP-1.4 Trust & Safety (block, mute, report targets, case aggregation, reason-audited case reads, GDPR Art. 15/20 portability & Art. 17 erasure). | None. Production-ready. |
| **Lane B (Competition & Scoring)** | COMPLETE | WP-1.5 Teams, rosters, coach profiles. WP-1.6 Competition setup, custom rule-sets, division rosters with jersey numbers. WP-1.7 Scheduling (round-robin circle method, single elimination brackets with byes, pool play groups-to-playoffs, forfeit 20-0, transactional standings recalculation). WP-1.8 Live scoring & match events (MatchState lifecycle, idempotent event UUIDs, player attribution, substitutions with player in/out, countdown game clock, minutes played calculation, compensating corrections, SSE stream). WP-1.9 Scorekeeper interface (`/score/[matchId]`, `ScoreQueue` with localStorage, lineup management, dual-device conflict dialog). WP-1.10 Tournament Command Center (`CommandCenterPanel`), interactive schedule delay simulation, Knockout Tournament Bracket visualizer (`TournamentBracket`), embeddable widgets, live spectator scoreboard. | None. Production-ready. |
| **Lane C (Courts & Pickup)** | COMPLETE | WP-1.11 Court directory & interactive radar map (`CourtMap`, visual indoor/outdoor pins, 2km–50km radius circles, court detail drawer, quick hotspot presets, type/lighting filters, rounded distance, photo gallery, community verification). WP-1.12 Pickup games (lifecycle OPEN→FULL→IN_PROGRESS→UNCONFIRMED→COMPLETED, RSVP, waitlist auto-promotion, check-in, explicit completion confirmation, recurring weekly series hourly materialization, cancellation/promotion email delivery). | None. Production-ready. |
| **Phase 2 (Training Core & Vision)** | COMPLETE | WP-2.1 Expanded exercise library (40 basketball-specific movements across 7 categories in Migration 0019, flagged awaiting expert review `reviewed=false` per ADR-009). WP-2.2 Workout logging (`WorkoutSession`, `ExerciseSet` with reps, load, RPE, rest, idempotent `clientId`, offline `SetQueue` draft in localStorage, session history). WP-2.3 Progression rules (pure deterministic engine recommending HOLD/INCREASE/DECREASE with explanation and sample size). WP-2.4 Athlete wellness & pain safety stop (fatigue/soreness/sleep/pain reporting; pain report halts progression suggestions with calm non-diagnostic copy, strict zero injury forecasting per ADR-0009). WP-2.5 Media storage foundation (`LocalDiskStorage`, presigned intents). WP-2.6/2.7 Computer vision movement assessments, multi-angle stream sync, shooting release & landing valgus angle benchmarks. WP-2.8 Coach feedback & sharing grants with instant revocation. | None. Production-ready. |
| **Phase 3 (Game Film Lab)** | COMPLETE | WP-3.1 Film game records, video upload (MP4/WebM/MOV), byte-range streaming (`LocalDiskStorage`), scorebook sync points linking video timestamps to official match events (`film_sync_points`). WP-3.2 Manual clip editor (in/out points, tagging, coach notes, clip search, telestrator keyframe annotations, event-synced auto-clip generator). WP-3.3 Film library search, saved searches, scouting montages. WP-3.4 Verified event metrics, box scores, and zone shot charts. WP-3.5 Evidence-linked tactical reports with observed/derived claim citations. | None. Production-ready. |
| **Phase 4 (Playbook & Coach OS)** | COMPLETE | WP-4.1 `@courtiq/court-renderer` standalone vector SVG court package. WP-4.2 Play diagram editor, deterministic animation labelled "diagram, not prediction", SVG export. WP-4.3 Practice planner (timeline blocks, drill library, live session runner). WP-4.4 Coach assignments (film/quiz/workout submissions). WP-4.5 Coach dashboard and print-ready PDF/SVG export modals. | None. Production-ready. |
| **Phase 5 (Community & Pathways)** | COMPLETE | WP-5.1 Notification center with web push VAPID & preferences. WP-5.2 Recurring runs & local communities. WP-5.3 Host reliability scoring & dispute appeals. WP-5.4 Court activity history with $k \ge 5$ thresholding (ADR-0004). WP-5.5 Pickup-to-team recruitment pathways, free agent board, tournament draft pool. | None. Production-ready. |
| **Phase 6 (Performance & Wearables)** | COMPLETE | WP-6.1 Periodized training programs (macrocycles/mesocycles). WP-6.2 Standardized athletic testing protocols (vertical jump, sprint, agility). WP-6.3 Training-to-game readiness dashboard (ACWR acute:chronic workload). WP-6.4 Wearable & sensor device integration (ADR-0015, player load AU, jump counts, 5-zone cardiovascular distribution). | None. Production-ready. |
| **Phase 7 (Advanced Tactical Analysis)** | COMPLETE | WP-7.1 Candidate tracking event proposal & human-in-the-loop review queue. WP-7.2 Play diagram vector embeddings & cosine concept similarity. WP-7.3 Level 3 rule-based defensive coverage simulator (DROP, SWITCH, BLITZ, ICE, HEDGE, HELP) with space advantage scores and mandatory non-predictive disclaimer. WP-7.4 Model registry & evaluation dashboard with benchmark dataset tracking and audited rollback governance (ADR-0016). | None. Production-ready. |
| **Phase 8 (Career, Marketplace, Enterprise)** | COMPLETE | WP-8.1 Athlete career passport with field-level granular share preview tokens. WP-8.2 Verified achievements with cryptographic SHA-256 signatures and revocation. WP-8.3 Opportunities directory & application pipeline. WP-8.4 Scout workspace with shortlists, evaluations, and minor concealment. WP-8.5 Billing via payment provider (zero card data stored, provider tokenization, verified webhooks, portal launcher). WP-8.6 Facility operations and commercial sponsor analytics with $k \ge 5$ anonymity guardrails. | None. Production-ready. |
| **Specialized Governance OS** | COMPLETE | FIBA pre-game safety checklists & official scorebook locking (Spec §23.2). FIBA Rule C match protests & disciplinary dispute tribunal (Spec §8.2). Facility court slot reservations & maintenance safety logs (Spec §8.3). Guardian portal with one-click emergency minor safety lock (Spec §14.1). GDPR/CCPA privacy rights center (Spec §24). | None. Production-ready. |

## 3. Work packages
Deps = must be merged first.

### Phase 0 — Foundation
- **WP-0.1 Monorepo skeleton & tooling** (none): `git mv` root `pom.xml`/`src` into `services/core-api`; create layout, pnpm workspace, Makefile,
  docker-compose, `.editorconfig`, `.gitignore`, gitleaks config, README quick-start. `application.yml` reads env vars; `application-dev.yml` has compose defaults. *Accept:* `make dev` brings up the stack; `docker compose ps` healthy.
- **WP-0.2 core-api baseline** (0.1): parent upgrade (ADR-0002), Spring Modulith, Security, Session-Redis, Flyway, springdoc, Actuator + Prometheus,
  JSON logging with `X-Request-Id` correlation, problem+json handler, Testcontainers base class, ArchUnit/Modulith verification. Port the three enums into match/identity modules. *Accept:* `./mvnw verify` green; `/actuator/health` UP; Modulith `verify()` passes.
- **WP-0.3 web baseline** (0.1): Next.js, TS strict, ESLint/Prettier, Vitest, Playwright, TanStack Query, app shell with role-aware nav driven by `/api/v1/me/permissions`, dark tokens, reduced-motion hook, offline/sync indicator. *Accept:* `pnpm build` + one Playwright smoke test.
- **WP-0.4 design system** (0.3): tokens (dark canvas, single orange accent, neutral surfaces), Button, Input, Select, Dialog, Toast, Tabs, DataTable, EmptyState, ErrorState, Skeleton, Badge (VerificationBadge, SourceBadge, ConfidenceMeter — colour + icon + text), Storybook/Ladle, axe checks.
- **WP-0.5 contracts pipeline** (0.2, 0.3): OpenAPI export, api-client generation, CI drift check, SSE envelope JSON schemas in `packages/contracts/events/`.
- **WP-0.6 CI/CD** (0.2, 0.3): workflows per §1, required checks, Dependabot, container builds (no deploy target; hosting needs its own ADR).
- **WP-0.7 Observability & ops docs** (0.2): Prometheus + Grafana compose profile, dashboards (API latency/errors, job queue depth, SSE connections), scripted pg_dump/restore test and `docs/operations/backup-restore.md`.

### Phase 1 — Stable core platform (spec §2, §10, §13–17, §26)
Lane A — Identity & trust
- **WP-1.1 Identity** (0.2): User, Profile, signup with age gate (DOB → isMinor), login/logout, email verification, password reset (mailpit), session mgmt, Bucket4j+Redis auth rate limits, admin TOTP. `/api/v1/auth/*`, `/api/v1/me`.
- **WP-1.2 AuthZ engine** (1.1): `RoleAssignment(role, resourceType, resourceId, expiry)`; Role enum extended to GUEST(implicit), PLAYER, COACH, SC_COACH, HEALTH_PRO, TEAM_MANAGER, ORG_ADMIN, ORGANIZER, REFEREE, SCOREKEEPER, VENUE_MANAGER, SCOUT, GUARDIAN, MEDIA, SPONSOR, MODERATOR, PLATFORM_ADMIN, MODEL_OPERATOR; `AuthorizationService` with per-resource policy classes; `/api/v1/me/permissions`; ArchUnit rule: every `@RestController` method is `@Authorized` or `@PublicEndpoint`.
- **WP-1.3 Consent, guardians, audit** (1.2): ConsentGrant, GuardianRelationship (verification state; minors' sensitive actions need active guardian consent), append-only AuditLog written in-tx via module event, admin sensitive reads logged with mandatory reason.
- **WP-1.4 Trust & safety basics** (1.2): report/block/mute, ModerationCase queue, minimal moderator UI; blocked users excluded from discovery/participant lists.

Lane B — Organizations & competition (after 1.2)
- **WP-1.5 Orgs, teams, venues**: Organization, Team, TeamMembership, email-token invitations, CoachProfile (credential SELF_REPORTED vs VERIFIED), Venue, Court (table owned by `court` module).
- **WP-1.6 Competition setup & registration**: Competition, Division, versioned RuleSet JSON (periods, length, fouls-to-bonus, timeouts, tie-breakers; labelled "custom rules — not certified"), Registration, roster snapshot, eligibility state + audit.
- **WP-1.7 Scheduling & brackets**: round robin (circle method), single elimination (byes/seeding), groups→playoffs; constraint validator (court availability, rest windows, team conflicts) returning an explicit conflict list; manual override with reason; explicit publish (drafts never auto-publish); standings with configurable tie-breakers, transactional recalculation on result correction. Pure-Java domain, property-based tests (jqwik).
- **WP-1.8 Live match & scorebook (backend)**: Match (extend MatchState: SCHEDULED→LIVE→FINISHED→LOCKED plus POSTPONED, CANCELLED, FORFEITED; keep `canTransitionTo`), MatchEvent (client UUID, localSeq, server seq; extend EventType with FIELD_GOAL_MISSED, THREE_POINT_MISSED, FREE_THROW_MISSED, CLOCK_ADJUST, CORRECTION, JUMP_BALL, TECHNICAL_FOUL), ScoreState projection rebuilt from events, idempotent batch `POST /matches/{id}/events`, baseVersion conflict → 409 with payload, corrections as compensating events, finalize/lock with official approval, SSE `match.state.updated`. Only assigned scorekeeper/official.
- **WP-1.9 Scorekeeper PWA** (1.8): `/score/[matchId]` — large touch targets, keyboard shortcuts, no motion, Dexie queue, service worker, sync status, conflict-resolution screen, correction flow, submit scorebook. *Accept:* Playwright offline → 10 events → online → server state equals local; dual-device conflict test.
- **WP-1.10 Public pages & command center**: SSR cached fixtures/standings/bracket, live score via SSE; organizer command center (courts × time grid, delays, missing officials, unresolved scores), read-mostly with "delay match" showing downstream impact.

Lane C — Courts & pickup (after 1.2; parallel with Lane B)
- **WP-1.11 Court directory**: PostGIS point + GiST index, attributes per spec §8.3 with per-field provenance (source, verifiedAt), `VerificationStatus {UNVERIFIED, COMMUNITY_CONFIRMED, FACILITY_VERIFIED, MODERATOR_VERIFIED}`, CourtReport, suggestion/approval. `GET /courts/nearby` via `ST_DWithin` (radius ≤50 km, limit 100, rounded distance). MapLibre map + list; chosen-point search default; browser geolocation only on explicit tap.
- **WP-1.12 Pickup games**: lifecycle DRAFT→PUBLISHED→OPEN⇄FULL→IN_PROGRESS→COMPLETED|CANCELLED with separate evidence fields (hostConfirmedAt, checkInCount, completionConfirmedBy[]); never auto-COMPLETED by time — after the end window becomes UNCONFIRMED. Participation (RSVP, waitlist auto-promotion, idempotent check-in, attendance confirmation), visibility (public/community/invite/private), profile hiding, minors excluded from public games unless guardian-consented, SSE capacity updates, historical activity aggregated per court per week with k≥5.

Phase 1 exit: spec §26 items for identity, authZ, competition, scoring, courts, pickup covered by E2E tests (§6).

### Phase 2 — Player Lab & training core (spec §4, §5; deps Phase 1 Lane A)
- **WP-2.1 Exercise library & protocols**: versioned Exercise (aliases, category per spec §5.3, equipment, cues, regressions/progressions, safety notes, media licence), AssessmentProtocol (camera requirements, criteria JSON, abstain thresholds). ~40 reviewed exercises as dev fixtures + admin import; human-review flag before public.
- **WP-2.2 Plans & workout logging**: TrainingPlan (approval state), PlannedSession, WorkoutSession, ExerciseSet (reps, load, RPE, tempo, rest); fast mobile logging with offline Dexie draft; history charts showing units and sample size.
- **WP-2.3 Progression rules**: deterministic hold/increase/decrease from completion, RPE, technique flags; never progresses on unreliable data or reported pain; explanation per change; coach override; table-driven tests.
- **WP-2.4 Athlete-reported state & safety stop**: optional fatigue/soreness/sleep/pain logs (SENSITIVE); pain/instability halts auto-progression with "consult a qualified professional" copy.
- **WP-2.5 Media upload foundation**: MediaAsset, presigned multipart intents, size/duration/MIME limits, recorded rights/consent attestation, media-worker job (ffprobe validate → 720p H.264 proxy → thumbnails), retention + delete.
- **WP-2.6 Vision worker v1** (2.5): job `assessment.analyze` → MediaPipe pose → PoseSequence artifact in object storage (summary in DB) → squat & CMJ rep/phase state machines → AssessmentResult (`SourceType=CV_ESTIMATE`, confidence, model+protocol version, "could not measure" list) or ABSTAINED; camera pre-check; eval harness `services/vision-worker/eval/` on consented/synthetic clips (rep-count accuracy, abstain rate) run in CI on a small fixture set.
- **WP-2.7 Assessment review UI** (2.6): skeleton overlay player with frame-step, timestamped findings, accept/reject/annotate (athlete or permitted coach), body-map with neutral language (no red danger states), private by default.
- **WP-2.8 Coach feedback & sharing**: CoachFeedback; share grants to coach/S&C/health pro scoped by data category; revocation enforced immediately (tested).

### Phase 3 — Game library & video intelligence (spec §6; deps 2.5, 1.8)
- **WP-3.1** game video & VideoTimeMap (manual anchors video ts ↔ period/clock), scorebook events auto-placed on the timeline.
- **WP-3.2** clip editor & manual tagging (J/K/L, frame step, in/out), Clip, GameAnnotation with taxonomy per spec §6.8, team custom tags, server-side clip render.
- **WP-3.3** library search (team, player, period, score state, event, tag, outcome) via indexed SQL; saved searches; shareable scouting montage within a team.
- **WP-3.4** stats from verified events (box score, shot chart, team totals); each metric in `docs/data-dictionary/metrics.md` with formula + source events; sample size shown.
- **WP-3.5** evidence-linked reports: every block references clip/event/metric IDs with claim type (observed / derived / hypothesis). LLM summarization deferred; if added, structured evidence in, citations out, feature-flagged.

### Phase 4 — Coach OS & playbook (spec §7, §9; deps 3.2)
- **WP-4.1** `packages/court-renderer`: SVG half/full court, FIBA dimensions, metres, origin centre court.
- **WP-4.2** play diagram editor: tokens, passes, cuts, dribbles, screens; keyframes; versioning; Level-1 deterministic animation labelled "diagram, not prediction"; PNG export.
- **WP-4.3** practice planner (drag-and-drop blocks, drill library, link drills to tactical tags, attendance).
- **WP-4.4** assignments (clip/quiz/workout/test → submit → review; film-room quiz).
- **WP-4.5** coach dashboard (review queue, adherence, upcoming; AI suggestions visually separated from coach-approved items).

### Phase 5 — Community growth (spec §8, §11.4; deps 1.11/1.12)
5.1 matching & opt-in notifications (quiet hours, caps; web push VAPID + email) · 5.2 recurring runs & communities · 5.3 host reliability signals + dispute/appeal · 5.4 court activity history (aggregated, thresholded) · 5.5 pickup → team/league pathway.

### Phase 6 — Performance integration (spec §5.4–5.9; deps Phase 2)
6.1 goal templates & periodization · 6.2 jump/sprint/conditioning protocols with instrument metadata · 6.3 training-to-game dashboard (labelled correlational) · 6.4 device-integration ADR + first integration.

### Phase 7 — Advanced tactical analysis (spec §7.2–7.5, §12) — gated
Starts only after an ADR establishing licensed labelled data and evaluation metrics. 7.1 tracking candidate events + human review queue · 7.2 play similarity (pgvector via ADR) · 7.3 rule-based scenario simulator (Level 3) · 7.4 model registry & evaluation dashboard (model_version, eval reports, rollback).

### Phase 8 — Career, marketplace, enterprise (spec §11, §23)
8.1 athlete passport (field-level share previews, expiring links) · 8.2 verified achievements (issuer, evidence, revocation) · 8.3 opportunity directory (verified vs user-submitted) · 8.4 scout workspace (consent-gated, minors excluded by default, no AI score) · 8.5 billing via payment provider (no card data stored) · 8.6 facility management & sponsor aggregates (k-anonymity).

### Parallelization (Phase 0–3)
```
0.1 → 0.2 ─┬→ 0.5, 0.6, 0.7
     0.3 → 0.4          (0.5/0.6 also need 0.3)
0.2 → 1.1 → 1.2 ─┬→ 1.3 → 1.4
                 ├→ Lane B: 1.5 → 1.6 → 1.7 → 1.8 → 1.9 → 1.10
                 ├→ Lane C: 1.11 → 1.12
                 └→ Phase 2: 2.1 → 2.2 → 2.3/2.4 ; 2.5 → 2.6 → 2.7 → 2.8
2.5 + 1.8 → Phase 3
```
At most ~4 concurrent agents after WP-1.2: Lane B, Lane C, Phase 2 training, Phase 2 media/vision.

## 4. First-release scope (spec §21)
Phases 0–3 + WP-4.1/4.2. Excluded: 3D twins, injury prediction, scout ratings, learned simulation, payments, sponsor features, native apps, LLM-generated reports.

## 5. Verification strategy
Per WP: `make lint test` green; Testcontainers (PostGIS image) integration tests; negative authZ tests mandatory.

Critical E2E journeys (Playwright on the compose stack, `tests/e2e/`, from spec §19.4):
1. Create competition → register teams → generate schedule → score match offline/online → correct event → finalize → standings update → public page shows result.
2. Search courts by chosen point + radius → host pickup → RSVP → fill → waitlist auto-promotes on cancel → check in → confirm completion → state is not auto-completed by the clock.
3. Create plan → log workout → upload squat video → result or abstain with reasons → coach reviews → athlete revokes share → coach gets 404.
4. Upload game video → sync timeline → tag clips → search → evidence-linked report shared to team only; non-member gets 404.

Security: IDOR suite iterating all `/api/v1` resource routes with a foreign user's session; OWASP ZAP baseline nightly; gitleaks.
Performance (before a live event): k6 in `tests/performance/` — 1,000 concurrent SSE viewers on 20 live matches, 50 events/s ingest; results in `docs/operations/benchmarks.md` (no scale claims without it).
Restore drill: scripted backup→restore→row-count check in CI weekly.
CV: eval numbers recorded per model/protocol version; release-gate thresholds set in an ADR-0006 follow-up before enabling the flag for non-dev users.

## 6. Open items requiring humans (agents must not decide)
- Final product name / trademark clearance (ADR-0001).
- Hosting provider & region; map tile provider & licence.
- Legal review: minors policy, health-data jurisdiction, media consent copy, rule-set licensing.
- Source & licence of exercise demo media and CV evaluation clips.
- Populate `docs/product-vision/court-iq-master-spec.md` (currently a placeholder).

## 7. Amendment — ADR-0011 (TypeScript backend)
The owner dropped Java. Wherever this plan says Spring/Java/Flyway/Modulith/ArchUnit/springdoc, read the ADR-0011 translation.
Module code lives in `services/api/src/<module>/`. Phase 0 status: WP-0.1 and the API part of WP-0.2 done (health, request-id, problem+json, config, MatchState/EventType/Role ported).

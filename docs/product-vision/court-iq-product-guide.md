# COURT IQ — What We Are Actually Building

Companion guide to `COURT_IQ_Vision_and_System_Design.txt` (the master spec, not yet in this repo).
Plain-English product explanation, user journeys, system relationships, build priorities.
Status: product concept and implementation guide. Features and targets are proposed unless implemented and verified.

## 1. The simplest explanation
COURT IQ is a connected basketball platform for playing, improving, analyzing, organizing, and progressing in basketball.
It is not one screen, a bracket tool, an AI workout tracker, a court map, or a stats collection. It is a group of connected
tools that share the right information so a player, coach, organizer, or local community can do more with less manual work.

- **Player:** find a court or pickup game nearby or in another city; train with a basketball-goal plan; record exercises and get
  feedback on supported movements; measure strength, jumping, speed, conditioning, skills; upload game film; learn tactical
  patterns, create plays; track progress across training and games; build a credible profile and discover teams, coaches,
  tournaments, tryouts and development opportunities.
- **Coach:** manage team and athletes; review film; build a playbook and prepare for opponents; assign training and drills;
  review player progress and give feedback; connect practice goals to later match performance.
- **Organizer:** register teams and players; create competitions, schedules, brackets, standings, results; run live scoring and
  manage officials, venues, operations; publish an event page and make authorized results/footage available afterwards.
- **Community:** find courts, join pickup runs, host games, build recurring groups, form teams; see aggregated court activity
  history; grow informal runs into scrimmages, leagues, organized competitions.

COURT IQ helps people FIND, PLAY, MEASURE, LEARN, IMPROVE at basketball, and CREATE basketball opportunities. Build dependable
foundations first, prove complete workflows, add advanced intelligence as trustworthy data and validation become available.

## 2. Why this is more than a collection of features
The value is the connection between them — a feedback loop: evidence leads to an intervention; the intervention is practiced;
later evidence helps assess whether it worked.

1. A player uploads a recorded game.
2. The system organizes footage into possessions and links events to video timestamps.
3. The coach reviews a repeated defensive breakdown and confirms the pattern.
4. The coach creates a drill that reproduces that situation.
5. The player completes a supporting gym/movement program when appropriate.
6. The app records training and technique assessments.
7. A later game is analyzed to see whether decision-making, movement, or execution changed.
8. The coach reviews the evidence and updates the next plan.

A tournament is not only an event that ends with the final score: it can create verified results, footage, athlete histories,
scouting material and development opportunities — subject to permission and media rights. Design around connected journeys,
not a list of independent menu items.

## 3. The main products inside COURT IQ
- **A. Player Home** — adaptive starting point: today's workout/session/game, upcoming pickup and nearby courts, plan progress and
  next assessment, recent insights/feedback, messages and reminders, goal progress, relevant opportunities. Adapts to role and
  time context (game day vs training day); don't overwhelm with every metric.
- **B. Player Lab** — camera-based movement analysis, structured tests, training history: shooting mechanics, ball-handling,
  finishing, dunk approach and jump assessment, vertical/approach jump tests, rebounding positioning from film, defensive
  stance/closeouts/lateral movement, footwork/pivots/acceleration/deceleration/direction change, exercise technique for
  supported gym movements, movement screening and longitudinal comparison. Distinguish visible movement observations from claims
  about internal forces, anatomy or medical status. Each assessment includes: protocol; what the camera could/couldn't see; key
  timestamps/frames; detected criteria; confidence/measurement quality; suggested next step/drill/coach review; comparison with
  prior comparable tests. No single mysterious body score — separate, interpretable results per skill/test.
- **C. Strength & Conditioning OS** — maximal strength, hypertrophy supporting athletic goals, explosive power, plyometrics,
  sprint/acceleration/deceleration/COD, unilateral strength, posterior chain/calf/adductor/hip/trunk, upper body and contact
  prep, aerobic and repeated-effort conditioning, mobility/warm-ups/balance, exercise logging (sets, reps, load, rest, effort),
  equipment-based alternatives, training-load history and recovery check-ins, standardized testing and re-testing. The planner
  accounts for practices and games (tournament week ≠ off-season dose). Programs tie to goals and explain each exercise's
  purpose. No automatic load increases just because reps were hit — consider technique, experience, effort, recovery, coach
  guidance. Pain or concerning symptoms trigger stop-and-review, not diagnosis.
- **D. Game Intelligence & Video Lab** — upload/ingest video tied to game, teams, permissions; mark/detect periods, possessions,
  shots, rebounds, turnovers, fouls, substitutions; link every event to source video timestamp; human correction; search clips
  by event/player/game/tag/time; shot charts and summaries from confirmed data; lineup/role comparison where sample size
  supports it; scouting montages and post-game reports; tendencies across multi-day tournaments. State whether each event was
  manual, official, CV-inferred, or coach-confirmed; never silently turn guesses into official stats.
- **E. Tactical Playbook & Simulation Lab** — draw offensive routes/screens/spacing/cuts and defensive coverages; save named plays
  and variations; link plays to real possessions; search similar sequences; opponent tendency reports; build drills from
  problems; animate in 2D/3D; compare scenarios; store notes and assumptions. Simulation levels (never conflate): 1 diagram
  animation (no prediction); 2 video-grounded replay; 3 rule-based tactical scenario with explicit assumptions; 4 data-driven
  simulation trained/evaluated on sufficient data (later research).
- **F. Court Network & Pickup Games** — find courts by permitted location, chosen map point, neighborhood or city; custom radius;
  filter by indoor/outdoor, surface, access, hours, facilities, verified attributes; discover games now/later/future; filter by
  format, capacity, self-declared skill band, intensity, time, court type; host, invite, manage spots, waitlist, communicate;
  RSVP, cancel, check in, confirm attendance; recurring runs and groups; aggregated court history; travel planning; report
  outdated/unsafe/closed courts; grow into scrimmages and leagues. Past activity and live availability are shown separately.
  Attendance uses explicit check-in/post-game signals. Protect precise location: search by chosen point without sharing current
  location; no private home location or live location without explicit consent.
- **G. Coach OS** — teams, roster, roles, practice calendar, permissions; review film and confirm tactical observations;
  opponent reports and playbooks; practices (warm-up, technical, tactical, scrimmage, review); assign gym/skill plans within
  scope; review assessment history and adherence where permitted; annotate clips; goals and progress; check whether training
  objectives show up in later games; share reports with athletes/staff/guardians. Keep medical/personal information separate
  from ordinary team stats; private records only with legitimate permission or sharing grant.
- **H. Competition OS / Organizer OS** — create/configure competitions; register teams, rosters, officials, venues, courts,
  staff; rules, eligibility, formats, scheduling constraints, tie-breakers; round-robin schedules, brackets, standings, playoff
  progression; court allocation and time slots; live scorekeeping; corrections, protests, approvals, audit history; monitor
  delays, equipment issues, missing officials, incidents; publish schedules/scores/standings/updates; public tournament sites
  and post-event reports; store authorized video/results. Live scoring prioritizes correctness and recovery: a WebSocket message
  is not the permanent record; official changes are committed transactionally, audited, recoverable after disconnect.
- **I. Athlete Career OS** — profile and positions; team/competition history; verified or clearly labeled results; approved
  highlights and footage; standardized tests and skill progress; training milestones and coach-approved feedback; awards;
  tryouts/camps/academies/scholarships/leagues; selected shareable reports. Distinguish self-reported from official and
  verified; no single opaque AI rating; athlete controls sharing.
- **J. Facility, Referee, Scout, Support workspaces** — facility owners (listings, hours, slots, booking policy, condition
  reports, announcements); referees (assignments, official reports, rules); scorekeepers (live scoring, corrections, offline
  recovery for assigned games); scouts/recruiters (permissioned portfolios, records, clips, structured evaluation); S&C
  professionals (assessments, programming, progression, workload within scope); physios/medical (only qualified/authorized
  workflows with dedicated access controls); parents/guardians (age-appropriate schedules, consent, authorized updates for
  minors); moderators/admins (reports, abuse prevention, account integrity, verification, audit logs, access governance).

## 4. How information moves through the platform
A connected but permissioned model. Key records: person/account and roles; athlete profile and privacy; team, roster, coach
assignment, organization; court, facility, access details, location; pickup game, RSVP, waitlist, check-in, attendance
confirmation, post-game result; competition, match, schedule, officials, eligibility, official result; video asset, clip, event
timestamp, possession, player track, analysis job; tactical pattern, play diagram, scouting observation, drill, simulation
scenario; exercise, plan, set, rep, load, assessment, movement observation, progression history; achievement, opportunity,
application, media permission, shareable portfolio item.

Record origin/status where it matters: official, human-entered, coach-confirmed, user-reported, sensor-measured,
CV-estimated, model-predicted.

Flows:
- Development: GAME VIDEO → POSSESSION EVENTS → COACH-CONFIRMED PATTERN → PRACTICE DRILL → PLAYER TRAINING SESSION →
  MOVEMENT/TECHNIQUE REVIEW → LATER GAME → PROGRESS REVIEW.
- Pickup: COURT LISTING → GAME CREATED → RSVPS → WAITLIST/CONFIRMATIONS → CHECK-IN → COMPLETED SESSION → OPTIONAL APPROVED
  STATS/CLIPS → COMMUNITY HISTORY.
- Tournament: EVENT CREATED → TEAMS REGISTERED → SCHEDULE GENERATED → MATCHES SCORED → RESULTS APPROVED → STANDINGS UPDATED →
  PUBLIC RESULTS → AUTHORIZED GAME ARCHIVE → ATHLETE CAREER RECORD.
Workflows connect without merging all data into a public record; private assessments, location, medical information and
unpublished film remain access-controlled.

## 5. What the AI actually does
Multiple narrowly defined systems, not one magical model:
1. Pose estimation under supported camera conditions. 2. Exercise recognition and phase detection. 3. Measurement engine
(landmarks, timing, calibration, sensors). 4. Game event extraction (candidates). 5. Human correction and confirmation.
6. Tactical retrieval (structured events + video embeddings). 7. Recommendation engine from confirmed observations,
coach-defined rules, documented assumptions. 8. Report assistant explaining retrieved facts with evidence links.
9. Scheduling and matching logic from explicit constraints. 10. Model evaluation (error, confidence, generalization, drift).

A text model must not invent measured facts or silently change official records. Ordinary video cannot measure every force,
muscle capacity, tissue stress or injury risk; flag observable patterns for review, never diagnose or guarantee injury-proneness.
Label separately: authored play diagram; animation; video replay; predictive simulation.

## 6. A normal day
- **Player:** morning plan → gym logging with supported form feedback → completion + technique observations + next target (no
  automatic load bumps for engagement) → pickup search by radius / court details → post-game attendance, optional stats/clip →
  game-analysis day with a short list of priorities linked to real clips.
- **Coach:** readiness and schedule → opponent confirmed tendencies → prepare practice → player-specific work → review
  completion and video feedback → post-game confirm key events, annotate clips, turn issue into practice objective, evaluate
  improvement in following games.
- **Organizer:** fixtures and officials → monitor courts/progress → handle delays/corrections → announcements → publish approved
  results → archive supports analysis and career records where authorized.
- **New-city player:** search public courts within a custom radius → filter runs by time/format → review court info → join →
  directions. Never reveal other users' exact locations.

## 7. Product experience
One coherent product with role-based workspaces. Navigation: Home, Player Lab, Gym/Training, Game Film, Playbook/Simulator,
Find Courts/Pickup, Teams/Coach Workspace, Competitions, Career, Messages/Notifications, Profile/Settings. Navigation varies
by role (casual player: Home, Train, Find a Game, Game History, Profile; coach: Team, Film, Playbook, Practice, Athletes,
Reports; organizer: Events, Schedule, Live Operations, Teams, Venues, Results). One user can hold multiple roles — use a
role/workspace switcher, with explicit authorization for team, organizer or professional data.
Design: premium sports-tech language; strong typography and hierarchy; dark surfaces with clear contrast and purposeful accents,
accessible light/dark where feasible; high-quality court diagrams and timelines; motion for plays, progress, schedule changes,
state transitions; reduced-motion support; fast scorekeeping and workout screens; phone-first for pickup/gym/recording;
desktop/tablet-friendly coaching and organizer; clear loading, empty, error, offline and low-confidence states. Motion is not
evidence predictions are correct.

## 8. What to build first
Bounded set proving the core loops; complete end-to-end tasks, not attractive screens with no data.
- **Foundation:** auth, role-based access, profiles, permissions, teams, basic audit history; shared design system and
  responsive shell; PostgreSQL model, API conventions, object storage, background jobs, logging, monitoring.
- **First player workflow:** athlete profile and goals; workout planner/logging; exercise database; limited video-supported
  movement assessments with clear setup; assessment history and coach review.
- **First game workflow:** upload game video; manual tagging of games/possessions with assisted entry; search clips by timestamp
  and label; basic shot/event summaries; draw and animate 2D plays; scouting report grounded in reviewed footage.
- **First community workflow:** court directory; search by chosen or authorized location with custom radius; create pickup
  games, RSVP, waitlist, cancel, confirm completion; historical activity separate from scheduled/live; reporting and privacy.
- **First competition workflow:** create tournament, register teams, schedule matches, enter scores, standings, publish
  results; official score data transactional and auditable.

## 9. What comes later
- Phase 2: better assisted tagging/event extraction; detailed profiles, team analytics, assessment templates; practice planner
  and development assignments; notifications, recurring pickup, court verification, community groups.
- Phase 3: multi-game opponent tendencies; search across many games/clips; automated montages, richer 2D/3D animation; more
  supported exercises and standardized tests; career portfolios, tryout listings, coach/org workflows.
- Phase 4: sensor integrations and reliable performance testing; improved player/ball tracking when evaluated; data-driven
  tactical modeling and simulation trials; advanced workload insights and coach-approved periodization; facility tools,
  sponsor services, broader competition integrations.
- Research frontier: high-fidelity multi-agent tactical simulation; personalized athletic digital twins; AR court coaching;
  broad basketball video foundation models. Present as implemented only after working prototypes and evaluated limits.

## 10. Core technical design in plain English
One dependable backend for important basketball records, with specialized processing services where needed.
- Web/mobile interface: role-specific experience; captures workout logs, RSVPs, scorekeeping, corrections; plays video and
  clip/tactical visualizations.
- Core backend: owns accounts, profiles, teams, roles, competitions, matches, exercises, workouts, pickup, permissions, audit;
  validates actions; persists official events reliably.
- Relational database: structured records, geospatial court search; official competition state separate from model estimates
  and private health data.
- Media storage: recordings, exercise clips, highlights, processed artifacts; access policy, retention, signed access.
- Background processing: video analysis, clips, reports, notifications, inference; safe retries without duplicating official
  records.
- Real-time delivery: live scoreboards, match centres, schedule boards, dashboards; updates not source of truth; reconnect and
  recovery.
- AI/CV services: pose, event candidates, movement calculations, retrieval, inference; structured outputs with timestamps,
  version, confidence, evidence; never bypass authorization or write unreviewed model claims into official records.
- Analytics: derived stats and trends from validated records; expensive analysis separate from live-scoring transactions.
Initial backend: modular monolith with clear domain boundaries; extract services only when load, model workloads, deployment or
ownership justify it.

## 11. Keeping data trustworthy
Records carry source and validation status. Official score = confirmed by authorized scorekeeper/competition workflow. Video
shot attempt = candidate until validated. Jump height: calibrated equipment = measured per documented protocol; phone video =
estimate with method and confidence. Workout completed = logged by user or confirmed by sensor/workflow. Pickup attendance:
scheduled, RSVP'd, checked in, completed/confirmed — distinct states. Achievement: self-reported or independently verified.
Tactical recommendation = generated hypothesis with evidence links. Authorized people can correct records; corrections are
audited, not silent rewrites. AI reports link to source clips/stats/assessments/rules, and say so when evidence is insufficient.

## 12. Safety, privacy, responsible behavior
- No claim of FIBA authorization or official compliance without evidence and permission.
- Protect profiles, private video, health notes, live location; no precise location from profile or attendance history.
- Special safeguards for minors and guardian consent; clear media rights/recording permissions before processing or sharing.
- Users control visibility of career records and body assessments.
- No medical diagnosis or guaranteed injury prediction from ordinary video; avoid unsafe prescriptions and unreviewed maximal
  testing, especially for beginners and minors; professional referral/review path for pain, instability, concerning symptoms.
- Reporting, moderation, blocking, no-show handling, safe event participation.
- Secure sessions, roles, media access, admin operations, audit logs; retain only needed data and explain deletion/retention.

## 13. What makes COURT IQ different
The connected improvement loop, not the raw feature count: games reveal questions → Player Lab measures supported criteria →
S&C turns goals into a program → Coach OS turns findings into practice → Court Network gives places to play → Competition OS
records official results → Career OS preserves permissioned achievements → later evidence tests whether interventions helped.

## 14. What success looks like
Players find a useful court and join a real game, train sensibly, record supported assessments, understand observations, and
measure progress. Coaches review film, find a real issue, make a play/drill, assign practice, and check improvement. S&C
professionals build and review basketball programs while respecting video-measurement limits. Organizers run reliable
schedules, scoring, standings, corrections and publication. Communities discover courts, host regular games, grow into events;
a player in a new city can still find where to play. The system explains the origin of a number or recommendation, preserves
evidence, admits uncertainty, and lets humans correct it. Success = completed workflows, trustworthiness, participation,
useful training decisions, reliable competition operations, measurable outcomes — not the number of AI buttons.

## 15. One-sentence definition
COURT IQ is a basketball operating system that connects court discovery, pickup games, athlete body and form analysis,
basketball-specific gym training, recorded-game intelligence, tactical playbooks and simulations, coaching, tournament
operations, and career development into one permissioned platform — so players can play more, understand their performance,
improve with evidence, compete, and find their next opportunity.

## 16. Using this with the master specification
Use this file to explain the product to teammates, designers, stakeholders or coding agents. Use
`COURT_IQ_Vision_and_System_Design.txt` for functional lists, role permissions, entities, APIs, architecture boundaries,
testing, non-functional targets and the detailed roadmap. Neither proves features exist in software: inspect the codebase,
separate implemented from missing, make architecture decisions explicit, validate risky capabilities with prototypes and data.

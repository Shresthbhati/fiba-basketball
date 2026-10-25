# ADR-0016: Advanced Tactical Analysis, Tracking & Evaluated ML Protocol

Status: Accepted (WP-7.1–WP-7.4, Spec §7.2–§7.5, §12)

## Context & Motivation
Phase 7 of the COURT IQ implementation plan unlocks advanced tactical intelligence, optical player tracking event candidates, play similarity matching, rule-based scenario simulations (Level 3), and audited machine learning governance. In accordance with the project gate specified in `docs/implementation-plan.md` ("Starts only after an ADR establishing licensed labelled data and evaluation metrics"), this ADR establishes the operational and architectural foundations for responsible tactical ML.

## Decision

1. **Licensed Data Provenance & Ground Truth Verification**:
   - Tracking footage and candidate events must originate from licensed broadcast data, team-recorded footage, or consented tournament streams.
   - All machine-generated tactical candidates are attributed with `SourceType.MODEL_INFERENCE` and store model metadata (version, timestamp, inference confidence score $C \in [0.0, 1.0]$).

2. **Human-in-the-Loop Candidate Review Queue (WP-7.1)**:
   - Automated detectors propose tactical candidates:
     `PICK_AND_ROLL | POP | SCREEN_AWAY | DRIVE_AND_KICK | CUT_TO_RIM | ISOLATION | POST_UP | TRANSITION_BREAK`.
   - Candidates enter a review queue in status `CANDIDATE`.
   - A candidate is never incorporated into authoritative team stats, scouting reports, or opponent DNA models until explicitly approved by an authorized coach or video analyst (`CONFIRMED` or `ADJUSTED`).
   - If deemed inaccurate or noise, the reviewer transitions the candidate to `REJECTED` with an optional note for model re-training feedback.

3. **Play Diagram Vector Embedding & Concept Similarity (WP-7.2)**:
   - Play diagrams and movement sequences are projected into normalized spatial trajectory vectors (encoding keyframe action types, start/end FIBA coordinates, pass vectors, and screen locations).
   - Playbook similarity queries compute cosine distance between play embeddings, enabling coaches to find structurally similar plays, counters, and defensive responses across internal playbooks and opponent scouting libraries.
   - Search results display confidence percentages and keyframe trajectory overlays.

4. **Level 3 Rule-Based Scenario Simulator (WP-7.3)**:
   - In accordance with Spec §7.3 and ADR-0007, simulation explores defensive coverage adaptations against offensive plays using deterministic basketball rules:
     - Pick-and-roll coverages: `DROP`, `SWITCH`, `BLITZ_TRAP`, `HEDGE_AND_RECOVER`, `ICE_WEAK`.
     - Off-ball screen responses: `CHASE`, `GO_UNDER`, `TOP_LOCK`, `SWITCH`.
     - Help principles: `HELP_AND_RECOVER`, `ROTATE_LOW_MAN`, `STUNT_AND_RETREAT`.
   - The simulation outputs spatial coverage advantage analysis, open passing lanes, and contest probabilities.
   - All scenario views must carry the clear disclaimer:
     *"Level 3 Rule-Based Scenario Simulation — tactical schematic illustration, not an empirical outcome prediction."*

5. **Model Registry, Benchmarking & Rollback Governance (WP-7.4)**:
   - Machine learning and heuristic models are cataloged in an auditable registry:
     - `modelVersion`: SemVer identifier (e.g., `v1.2.0`)
     - `modelType`: `CV_TRACKING | TACTICAL_CANDIDATE | PLAY_EMBEDDING | COVERAGE_SIMULATOR`
     - `benchmarkDataset`: Reference identifier for held-out evaluation dataset
     - `metrics`: Quantitative performance metrics ($F_1$ score, precision, recall, mean absolute error $\text{MAE}$)
     - `status`: `CANDIDATE | ACTIVE | DEPRECATED | ROLLED_BACK`
     - `activeSince`: Timestamp when promoted to production
     - `rollbackReason`: Audited justification if rolled back
   - Platform administrators and authorized org coaches can inspect model provenance, trigger validation evaluation runs, and execute atomic rollbacks to previous stable model versions if model drift or regression is detected.

6. **Authorization & Privacy (ADR-0010)**:
   - Candidate queues, play similarity searches, scenario simulations, and team-specific model configurations are private to authorized team coaching personnel.
   - Cross-team queries or unauthenticated requests return RFC 9457 `404 Not Found` (never 403).

## Consequences
- Full compliance with Court IQ responsible AI principles: zero black-box predictions and mandatory human review before data becomes official.
- Transparent and auditable model lifecycle with rollback safety guarantees.
- Enables high-level tactical coaching preparation without statistical distortion.

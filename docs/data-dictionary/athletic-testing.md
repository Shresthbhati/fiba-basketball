# Athletic Testing & Combine Battery ("Train" / "Player Lab")

Standardized physical tests and combine protocols (Master Spec §5.4–§5.9, Implementation Plan WP-6.2).

## Access & Privacy Rules
- **Athletic test sessions and attempts are private by default**: accessible only to the athlete owner and coaches on teams the athlete belongs to.
- Any request for another athlete's test session without authorization yields an RFC 9457 `404 Not Found` (negative authZ per ADR-0010; never reveals test existence).
- Athletic testing protocols and normative percentile benchmarks are public read-only references (`GET /api/v1/athletic-testing/protocols`, `GET /api/v1/athletic-testing/benchmarks`).
- **No injury probability prediction or medical diagnosis**: all outputs are descriptive, normative performance percentiles without speculative medical or injury claims (ADR-0009).

---

## 1. Core Protocols (`athletic_test_protocols`)
The combine battery implements 6 basketball-standardized performance tests:

| Slug | Name | Category | Primary Unit | Direction | Standard Attempts | Target Athletic Dimension |
|---|---|---|---|---|---|---|
| `standing-vertical-jump` | Standing Vertical Jump | JUMP | cm | DESC (Higher is better) | 3 | Explosive lower-body power (no step) |
| `max-vertical-jump` | Maximum Vertical Jump | JUMP | cm | DESC (Higher is better) | 3 | Approach jump capability & rim reach |
| `three-quarter-court-sprint` | 3/4 Court Sprint (22.86m) | SPEED | seconds | ASC (Lower is better) | 3 | Linear acceleration & transition sprint |
| `lane-agility-drill` | Lane Agility Drill (5.8m x 4.9m) | AGILITY | seconds | ASC (Lower is better) | 2 | Perimeter change of direction & defensive slides |
| `pro-agility-shuttle` | Pro-Agility Shuttle (5-10-5) | AGILITY | seconds | ASC (Lower is better) | 3 | Deceleration, lateral quickness & re-acceleration |
| `yoyo-intermittent-recovery-1` | Yo-Yo Intermittent Recovery Level 1 | CONDITIONING | level_shuttle | DESC (Higher is better) | 1 | Intermittent aerobic capacity & repeat-sprint fatigue |

---

## 2. Test Sessions (`athletic_test_sessions`)
Groups one battery or set of attempts performed on a given date:
- `id`: UUIDv7 PK.
- `userId`: UUID referencing the athlete `users.id`.
- `conductedByUserId`: UUID referencing the tester/coach `users.id` (nullable).
- `teamId`: UUID referencing `teams.id` (nullable).
- `testDate`: Date string (YYYY-MM-DD).
- `location`: Free-text venue name or court (e.g. "Main Gymnasium").
- `surface`: `HARDWOOD` | `SYNTHETIC` | `ASPHALT` | `OTHER`.
- `environmentalNotes`: Temperature, altitude, indoor/outdoor conditions.
- `notes`: General tester observations or notes.
- `createdAt`: ISO 8601 timestamp.

---

## 3. Test Attempts (`athletic_test_attempts`)
Individual test trials with instrument metadata and source provenance:
- `id`: UUIDv7 PK.
- `sessionId`: Foreign key to `athletic_test_sessions.id` (CASCADE).
- `protocolId`: Foreign key to `athletic_test_protocols.id`.
- `attemptNumber`: Integer (1, 2, 3...).
- `rawValue`: Floating point measurement in the protocol's unit (e.g. 74.0 cm, 3.18 s).
- `isFault`: Boolean (e.g. slipped, false start, missed line touch). Fault attempts are excluded from best score calculations.
- `faultReason`: Text description if faulted.
- `instrumentType`:
  - `VERTEC_VANES` — Vane jump tester (resolution ~1.27 cm / 0.5 in).
  - `CONTACT_MAT` — Contact/switch flight-time mat.
  - `OPTICAL_SYSTEM` — Infrared floor beam array (e.g. Optojump).
  - `TIMING_GATES_DUAL_BEAM` — Dual-beam infrared gates (resolution 0.001 s).
  - `TIMING_GATES_SINGLE_BEAM` — Single-beam optical gates.
  - `STOPWATCH_MANUAL` — Hand-held digital stopwatch (carries human reaction latency).
  - `CV_ESTIMATE` — Computer vision video estimate (ADR-0008).
- `instrumentDetails`: JSONB object holding serial number, model, beam height, calibration date.
- `sourceType`: Provenance classification per ADR-0008: `OFFICIAL` | `COACH` | `SELF_REPORTED` | `CV_ESTIMATE`.
- `confidence`: Numeric confidence between 0.0 and 1.0 (defaults to 1.0 for physical instruments; model estimate for CV).

---

## 4. Normative Benchmarks & Percentile Calculation
Percentile ranks ($P_{10}$ to $P_{99}$) derived from standardized basketball combine datasets across demographic cohorts:
- Cohorts: `U14_MALE`, `U14_FEMALE`, `U16_MALE`, `U16_FEMALE`, `U18_MALE`, `U18_FEMALE`, `COLLEGIATE_MALE`, `COLLEGIATE_FEMALE`, `PRO_MALE`, `PRO_FEMALE`.
- Percentile Interpolation:
  - For $P_{10}, P_{25}, P_{50}, P_{75}, P_{90}, P_{99}$ anchors:
  - If metric is higher-is-better ($v \ge v_{99} \implies P=99$; $v \le v_{10} \implies P=\max(1, \text{round}(10 \times \frac{v}{v_{10}}))$).
  - If metric is lower-is-better ($v \le v_{99} \implies P=99$; $v \ge v_{10} \implies P=\max(1, \text{round}(10 \times \frac{v_{10}}{v}))$).
  - Continuous piecewise linear interpolation between adjacent percentile anchors.
- Aggregate Athletic Signature:
  - **Power Score**: Average percentile across jump tests.
  - **Speed Score**: 3/4 court sprint percentile.
  - **Agility Score**: Average of lane agility and pro-agility shuttle percentiles.
  - **Conditioning Score**: Yo-Yo IR1 percentile.
  - **Overall Combine Index**: Weighted harmonic mean of completed dimensions.

---

## 5. API Endpoints
Base path: `/api/v1/athletic-testing`

- `GET /protocols`: Public list of standardized test protocols with equipment & warmup specs.
- `GET /benchmarks?cohort=`: Public normative benchmark anchors for specified cohort.
- `POST /sessions`: Create a new athletic testing session (authenticated athlete or squad coach).
- `GET /sessions`: List test sessions for current authenticated user or query `?userId=` for coaches.
- `GET /sessions/:id`: Get session details with all attempts and best calculated scores per protocol.
- `POST /sessions/:id/attempts`: Record an attempt with instrument metadata and source provenance.
- `DELETE /attempts/:id`: Delete an erroneous attempt.
- `GET /athletes/:userId/profile`: Aggregated combine profile, best historical marks, percentile rankings against selected cohort, and radar signature. Negative authZ (404) for unauthorized viewers.

---

## 6. Multi-Camera Assessment Streams (`assessment_camera_streams`)
Multi-angle video capture and synchronization for Player Lab motion analysis (Spec §4.1, §6.3, §9.2):
- `id`: UUIDv7 PK.
- `assessmentId`: UUID referencing `movement_assessments.id` (CASCADE).
- `cameraLabel`: `PRIMARY_SAGITTAL` | `SECONDARY_FRONTAL` | `ELEVATED_REAR` | `BASELINE_WIDE`.
- `videoUrl`: S3/MinIO presigned storage URL.
- `syncOffsetMs`: Integer millisecond offset relative to primary stream for frame-accurate scrubbing.
- `resolution`: Text descriptor (e.g., `1080p`, `4K`).
- `fps`: Frame rate integer (e.g., `60`, `120`, `240`).
- `isPrimary`: Boolean designating the primary master synchronization stream.
- `calibratedDistanceM`: Numeric distance from subject for spatial scaling.
- `createdAt`: ISO 8601 timestamp.

---

## 7. Shooting Mechanics Benchmarks (`shooting_mechanics_benchmarks`)
Kinematic reference thresholds for shooting form analysis:
- `id`: UUIDv7 PK.
- `tier`: `PRO` | `COLLEGIATE` | `VARSITY` | `YOUTH`.
- `minReleaseAngleDeg` / `maxReleaseAngleDeg`: Optimal ball release trajectory window (typically 46°–55°).
- `maxElbowFlareDeg`: Maximum recommended outward elbow flare (typically $\le 12^\circ$).
- `minReleaseTimeS` / `maxReleaseTimeS`: Gather-to-release duration benchmarks.
- `description`: Text coaching notes.

### Biomechanical Analysis Endpoints:
- `POST /api/v1/assessments/:id/streams`: Register multi-angle camera stream.
- `GET /api/v1/assessments/:id/streams`: List streams for assessment (enforces negative authZ 404).
- `DELETE /api/v1/assessments/streams/:streamId`: Remove camera stream.
- `POST /api/v1/assessments/:id/analyze-shooting`: Execute shooting form kinematic scoring against tier benchmarks.
- `POST /api/v1/assessments/:id/analyze-landing`: Execute bilateral landing stability and knee valgus assessment per ADR-0009.


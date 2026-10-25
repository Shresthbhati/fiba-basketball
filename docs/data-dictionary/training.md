# training ("Train")

Strength and conditioning logging. **Everything except the exercise library is private to its owner** (anyone else gets 404, anonymous gets 401).

- `exercises`: slug, name, category (STRENGTH | POWER | PLYOMETRIC | SPEED_AGILITY | CONDITIONING | MOBILITY | CORE), equipment, cues, safety_notes, `reviewed`.
  14 starter exercises are seeded by migration 0007. **All are `reviewed = false`: the content has not been checked by a qualified coach or physiotherapist** and the UI says so.
- `workout_sessions`: user, started_at, ended_at, notes, session_rpe (1–10).
- `exercise_sets`: session, exercise, set_number (assigned by the server), reps, load_kg, rpe (1–10), rest_seconds, `client_id` (unique; chosen by the device so retries never add a set twice).
- `wellness_checks`: one per user per day, optional: fatigue and soreness (1–5), sleep_hours, `pain_reported`, pain_note (only kept when pain is reported). Sensitive.

API (all `/api/v1`)
- `GET /exercises?category=` (public).
- `POST|GET /training/sessions`, `GET /training/sessions/:id`, `POST /training/sessions/:id/finish`, `POST /training/sessions/:id/sets` (idempotent by `clientId`; refused once the workout is finished), `PATCH|DELETE /training/sets/:id`.
- `GET /training/history/:exerciseId`: per-workout summary, newest first, plus `sampleSize` (how many workouts it is based on).
- `GET /training/progression/:exerciseId?targetReps=`: a **suggestion**, never an instruction, with an explanation and `basedOnSessions`.
- `POST|GET /training/wellness`: save today's check-in / read status.

Progression rules (`src/training/progression.ts`, pure and unit tested)
- Needs at least 2 workouts with a logged load, otherwise `INSUFFICIENT_DATA`.
- Works from the heaviest sets of each workout.
- `INCREASE` only when every heaviest set hit the target reps in the last two workouts and all those sets were logged at RPE 8 or easier. Increase is 2.5% rounded to 1.25 kg, at least one 1.25 kg step and at most 5 kg.
- Reps hit but RPE missing or too high: `HOLD` with the reason.
- `DECREASE` (about 5%) only after two workouts in a row that missed the target.
- **Pain reported in the last 7 days pauses all suggestions** (`HOLD`) and the API/UI show: "You reported pain. Training suggestions are paused. Please consider speaking to a qualified professional before continuing."
- Never outputs injury probability or a diagnosis.

## Wearable & Sensor Device Integration Architecture (WP-6.4, Spec §5.4–§5.9, ADR-0015)
- `athlete_devices`:
  - `id`: UUIDv7 PK
  - `user_id`: UUID references `users.id` (cascades on delete)
  - `device_manufacturer`: `GARMIN | POLAR | CATAPULT | VERT | WITTY | APPLE | GENERIC_IMU`
  - `device_model`: text (e.g. "Vector S7", "H10", "Forerunner 965")
  - `device_identifier`: text (serial number or device hash)
  - `firmware_version`: text
  - `calibration_date`: timestamp with time zone (optical / zero-point calibration)
  - `status`: `ACTIVE | RETIRED | DISCONNECTED` (default `ACTIVE`)
  - `created_at`, `updated_at`: timestamps
- `sensor_telemetry_sessions`:
  - `id`: UUIDv7 PK
  - `user_id`: UUID references `users.id` (cascades on delete)
  - `device_id`: UUID references `athlete_devices.id` (cascades on delete)
  - `practice_id`: UUID references `practice_sessions.id` (null on delete)
  - `match_id`: UUID references `matches.id` (null on delete)
  - `session_name`: text
  - `session_type`: `MATCH | PRACTICE | WORKOUT | RECOVERY | COMBINE | DRILL`
  - `source_type`: text default `SENSOR`
  - `started_at`, `ended_at`: timestamps
  - `duration_seconds`: integer
  - `distance_meters`: double precision
  - `player_load`: double precision (accumulated mechanical load in arbitrary units AU)
  - `jump_count`: integer
  - `max_jump_height_cm`: double precision
  - `max_acceleration_g`, `max_deceleration_g`: double precision
  - `avg_heart_rate_bpm`, `max_heart_rate_bpm`: integers
  - `time_in_zone_seconds`: jsonb (`{ z1, z2, z3, z4, z5 }`)
  - `samples_count`: integer
  - `raw_format`: `JSON | TCX | FIT | CSV`
- Provenance & Compliance (ADR-0009 & ADR-0015):
  - Ingested metrics carry `SourceType.SENSOR`.
  - Strictly non-diagnostic: displays descriptive load, jumps, and HR zones without injury probability or fatigue forecasts.
- API Endpoints:
  - `POST /api/v1/devices` (register athlete wearable/sensor)
  - `GET /api/v1/devices` (list registered devices)
  - `DELETE /api/v1/devices/:id` (retire device)
  - `POST /api/v1/devices/:deviceId/telemetry` (ingest sensor activity telemetry session)
  - `GET /api/v1/athletes/me/sensor-sessions` (list my sensor telemetry sessions)
  - `GET /api/v1/sensor-sessions/:id` (retrieve single telemetry session with zone breakdown)
  - `GET /api/v1/teams/:teamId/sensor-summary` (coach view: aggregate team mechanical load and minutes)

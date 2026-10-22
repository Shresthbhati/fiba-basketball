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

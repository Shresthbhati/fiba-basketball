# Periodized Training Programs & Macrocycle Templates ("Train" / "Coach OS")

Basketball-specific periodization architectures, mesocycles, weekly workout prescriptions, and athlete program tracking (Master Spec §5, Implementation Plan WP-6.1).

## Access & Privacy Rules
- **System program templates** (`is_template = true`) are public read-only references accessible to all authenticated players and coaches.
- **Team-specific programs** are accessible to verified members and coaches of the owning team.
- **Individual athlete program enrollments** are private to the enrolled athlete and authorized team coaches. Unauthorized access yields RFC 9457 `404 Not Found` (negative authZ per ADR-0010).
- **Safety Stop Rule:** If the athlete reports pain in any wellness check within the last 7 days, active program views display a prominent safety hold banner with the standard non-diagnostic copy: *"You reported pain. Training suggestions are paused. Please consider speaking to a qualified professional before continuing."*
- **S&C Expert Review Flag:** Seeded templates default to `reviewed = false`. The UI clearly states: *"Awaiting review by a certified CSCS or physiotherapist."* (ADR-0009).

---

## 1. Program Periodization Phases
Programs follow standardized basketball competition calendar phases:

| Phase | Duration Band | Frequency | Adaptation Target | Volume / Intensity Profile |
|---|---|---|---|---|
| `OFF_SEASON` | 6–12 weeks | 3–4 days/wk | Structural base, hypertrophy, peak force capacity | High volume, progressive overload |
| `PRE_SEASON` | 4–8 weeks | 3 days/wk | Explosive power, rate of force development (RFD), repeat sprint ability | Moderate volume, high velocity |
| `IN_SEASON` | 4–16 weeks | 2 days/wk | Neuromuscular retention, fatigue management, micro-dosing | Low volume, moderate-high intensity |
| `TOURNAMENT_PEAK` | 1–2 weeks | 2 days/wk | Neural priming, taper, joint mobility, zero residual fatigue | Minimal volume, maximal readiness |

---

## 2. Core Entities

### Training Programs (`training_programs`)
- `id`: UUIDv7 PK.
- `slug`: URL-friendly unique identifier.
- `name`: Descriptive program title.
- `phase`: `OFF_SEASON` | `PRE_SEASON` | `IN_SEASON` | `TOURNAMENT_PEAK`.
- `description`: Detailed periodization rationale and methodology.
- `durationWeeks`: Program span in weeks (1 to 24).
- `daysPerWeek`: Scheduled workouts per microcycle week (1 to 6).
- `targetLevel`: `BEGINNER` | `INTERMEDIATE` | `ADVANCED` | `ELITE`.
- `primaryGoal`: `VERTICAL_POWER` | `HYPERTROPHY_BASE` | `REPEAT_SPRINT_ABILITY` | `FATIGUE_MANAGEMENT` | `TOURNAMENT_READINESS`.
- `isTemplate`: Boolean (system/coach reusable template vs assigned custom program).
- `creatorId`: Foreign key to `users.id` (nullable).
- `teamId`: Foreign key to `teams.id` (nullable).
- `reviewed`: Boolean indicator confirming certification review.
- `createdAt`, `updatedAt`: Timestamps.

### Program Workouts (`training_program_workouts`)
- `id`: UUIDv7 PK.
- `programId`: Foreign key to `training_programs.id` (CASCADE).
- `weekNumber`: Week index within the macrocycle (1..N).
- `dayNumber`: Day index within the microcycle (1..7).
- `title`: Workout day title (e.g. "Lower Body Force & Deceleration").
- `focus`: Target training quality (e.g. `LOWER_BODY_FORCE`, `EXPLOSIVE_POWER`).
- `estimatedDurationMin`: Estimated session duration in minutes.
- `exercisesPrescription`: JSON array of prescribed exercise objects:
  ```json
  [
    {
      "exerciseId": "uuid",
      "exerciseSlug": "trap-bar-deadlift",
      "exerciseName": "Trap Bar Deadlift",
      "orderIndex": 1,
      "targetSets": 4,
      "targetReps": 6,
      "targetRpe": 8,
      "restSeconds": 120,
      "notes": "Focus on explosive concentric drive"
    }
  ]
  ```

### Program Enrollments (`program_enrollments`)
- `id`: UUIDv7 PK.
- `programId`: Foreign key to `training_programs.id`.
- `athleteId`: Foreign key to athlete `users.id`.
- `assignedByUserId`: Foreign key to coach `users.id` (nullable).
- `startDate`: Starting date string (YYYY-MM-DD).
- `currentWeek`: Current week index being executed.
- `status`: `ACTIVE` | `PAUSED` | `COMPLETED` | `CANCELLED`.
- `completedWorkoutIds`: JSON array of finished workout IDs for adherence tracking.
- `notes`: Custom athlete/coach tracking notes.
- `createdAt`, `updatedAt`: Timestamps.

---

## 3. API Endpoints
Base path: `/api/v1/training/programs`

- `GET /`: List available training programs (supports `?phase=`, `?targetLevel=`, `?teamId=`).
- `GET /:id`: Fetch complete program structure with all prescribed weekly workouts and exercises.
- `POST /`: Create custom program (coach/admin).
- `POST /:id/workouts`: Add or update prescribed workout day.
- `POST /:id/enroll`: Enroll authenticated athlete or assign to squad athlete (coach).
- `GET /enrollments`: List active and past program enrollments for athlete.
- `GET /enrollments/:id`: Fetch enrollment progress, completed workouts, and current week schedule.
- `POST /enrollments/:id/complete-workout`: Mark a prescribed workout as completed (or link to logged `WorkoutSession`).
- `PATCH /enrollments/:id/status`: Update enrollment status (`ACTIVE`, `PAUSED`, `COMPLETED`).

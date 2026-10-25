# ADR-0015: Wearable & Sensor Device Integration Architecture

Status: Accepted (WP-6.4, Spec §5.4–§5.9)

## Context & Motivation
Athletes and athletic trainers collect objective movement and load telemetry using wearable inertial measurement units (IMUs), heart rate monitors, electronic timing gates, and jump mats (e.g. Catapult, Polar, Garmin, VERT, Witty timing systems). To support multimodal performance tracking without vendor lock-in or proprietary device fragmentation, COURT IQ requires a standardized, privacy-preserving ingestion pipeline.

## Decision
1. **Provenance & SourceType**:
   All ingested wearable, sensor, and timing gate metrics are explicitly assigned `SourceType.SENSOR`. They cannot be conflated with official scorebook events (`OFFICIAL`), coach entries (`COACH`), or computer-vision estimates (`CV_ESTIMATE`).

2. **Device Registry & Calibration Metadata**:
   Each sensor telemetry payload is linked to an `AthleteDevice` record capturing:
   - `manufacturer`: `GARMIN | POLAR | CATAPULT | VERT | WITTY | APPLE | GENERIC_IMU`
   - `model`: Device model string (e.g., "Vector S7", "H10", "Forerunner 965")
   - `identifier`: Obfuscated serial number or client device hash
   - `firmwareVersion`: Reported firmware build
   - `calibrationDate`: Timestamp of last optical or zero-point calibration

3. **Telemetry Session Data Model**:
   Sessions record objective aggregate performance data:
   - Temporal: `startedAt`, `endedAt`, `durationSeconds`
   - Mechanical & Movement: `distanceMeters`, `playerLoad` (arbitrary load units $\text{AU}$), `jumpCount`, `maxJumpHeightCm`, `maxAccelerationG`, `maxDecelerationG`
   - Cardiovascular: `avgHeartRateBpm`, `maxHeartRateBpm`, `timeInZoneSeconds` (distribution across standard Zones 1–5)
   - Optional contextual linkages: `practiceId` or `matchId`

4. **Strict Compliance with ADR-0009**:
   Under no circumstances shall device telemetry be used to compute or display injury risk scores, medical diagnoses, tissue strain indices, or fatigue forecasts. All dashboard views must carry the compliance label:
   *"ADR-0009 COMPLIANT: Descriptive sensor telemetry only. No injury probability or medical diagnosis."*

5. **Supported Ingestion Protocols**:
   - Direct REST ingestion via `POST /api/v1/devices/:deviceId/telemetry` with normalized JSON payload.
   - Batch import parser for TCX (Training Center XML), FIT-normalized activity JSON, and CSV raw telemetry dumps.

6. **Privacy & Authorization (ADR-0010)**:
   - Device registrations and telemetry are strictly private to the athlete (`userId = req.user.id`).
   - Team coaches can access session summaries linked to team practices or matches only if the athlete is an active rostered team member.
   - Unauthorized access returns RFC 9457 `404 Not Found` (never 403) to prevent resource existence enumeration.

## Consequences
- Open and vendor-neutral: any Bluetooth/ANT+ or cloud-exported activity can be ingested without SDK licensing fees.
- Zero medical liability exposure per ADR-0009.
- Clean database indexing supporting high-frequency load tracking across seasonal training cycles.

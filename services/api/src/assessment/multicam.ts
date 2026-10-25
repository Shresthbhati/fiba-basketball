import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  assessmentCameraStreams,
  movementAssessments,
  shootingMechanicsBenchmarks,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";
import { canViewAssessment } from "./service.js";

export interface AddCameraStreamInput {
  cameraLabel: "PRIMARY_SAGITTAL" | "SECONDARY_FRONTAL" | "ELEVATED_REAR" | "BASELINE_WIDE";
  videoUrl: string;
  syncOffsetMs?: number | undefined;
  resolution?: string | undefined;
  fps?: number | undefined;
  isPrimary?: boolean | undefined;
  calibratedDistanceM?: number | undefined;
}

export interface ShootingAnalysisInput {
  releaseAngleDeg: number;
  releaseTimeS: number;
  elbowFlareDeg: number;
  setPoint: "ABOVE_BROW" | "AT_BROW" | "CHEST_LOW";
  guideHandContested?: boolean | undefined;
  tier?: "PRO" | "COLLEGIATE" | "VARSITY" | "YOUTH" | undefined;
}

export interface LandingAnalysisInput {
  bilateralContactDiffMs: number; // contact time delta between left & right feet
  kneeFlexionAtImpactDeg: number; // depth of shock absorption
  valgusIndex: "NONE" | "MILD_MEDIAL" | "NOTABLE_VALGUS";
  jumpHeightCm?: number | undefined;
}

/**
 * Attaches a synchronized multi-angle video feed to an existing assessment (Spec §4.1, §6.3, §9.2).
 */
export async function addCameraStream(
  db: Db,
  currentUserId: string,
  assessmentId: string,
  input: AddCameraStreamInput,
) {
  const [assessment] = await db
    .select()
    .from(movementAssessments)
    .where(eq(movementAssessments.id, assessmentId));

  if (!assessment) {
    throw new AuthError(404, "Assessment not found");
  }

  // Only the owner of the assessment can attach camera feeds
  if (assessment.userId !== currentUserId) {
    throw new AuthError(404, "Assessment not found");
  }

  const [stream] = await db
    .insert(assessmentCameraStreams)
    .values({
      assessmentId,
      cameraLabel: input.cameraLabel,
      videoUrl: input.videoUrl,
      syncOffsetMs: input.syncOffsetMs ?? 0,
      resolution: input.resolution ?? "1080p",
      fps: input.fps ?? 60,
      isPrimary: input.isPrimary ?? false,
      calibratedDistanceM: input.calibratedDistanceM != null ? String(input.calibratedDistanceM) : null,
    })
    .returning();

  if (!stream) {
    throw new AuthError(500, "Failed to create camera stream");
  }

  return stream;
}

/**
 * Lists all synchronized camera angles for an assessment (Spec §6.3).
 * Unauthorized users receive 404 (ADR-0010).
 */
export async function listCameraStreams(
  db: Db,
  currentUserId: string,
  assessmentId: string,
) {
  const [assessment] = await db
    .select()
    .from(movementAssessments)
    .where(eq(movementAssessments.id, assessmentId));

  if (!assessment) {
    throw new AuthError(404, "Assessment not found");
  }

  const allowed = await canViewAssessment(db, currentUserId, assessment);
  if (!allowed) {
    throw new AuthError(404, "Assessment not found");
  }

  const streams = await db
    .select()
    .from(assessmentCameraStreams)
    .where(eq(assessmentCameraStreams.assessmentId, assessmentId))
    .orderBy(desc(assessmentCameraStreams.isPrimary), desc(assessmentCameraStreams.createdAt));

  return streams;
}

/**
 * Deletes a camera stream.
 */
export async function deleteCameraStream(
  db: Db,
  currentUserId: string,
  streamId: string,
) {
  const [stream] = await db
    .select()
    .from(assessmentCameraStreams)
    .where(eq(assessmentCameraStreams.id, streamId));

  if (!stream) {
    throw new AuthError(404, "Camera stream not found");
  }

  const [assessment] = await db
    .select()
    .from(movementAssessments)
    .where(eq(movementAssessments.id, stream.assessmentId));

  if (!assessment || assessment.userId !== currentUserId) {
    throw new AuthError(404, "Camera stream not found");
  }

  await db.delete(assessmentCameraStreams).where(eq(assessmentCameraStreams.id, streamId));
}

/**
 * Evaluates basketball shooting mechanics against normative kinematic bands (Spec §4.1).
 * Adheres strictly to ADR-0008 (provenance & confidence) and ADR-0009 (no medical diagnosis).
 */
export async function analyzeShootingMechanics(
  db: Db,
  input: ShootingAnalysisInput,
) {
  const tier = input.tier ?? "COLLEGIATE";
  const [benchmark] = await db
    .select()
    .from(shootingMechanicsBenchmarks)
    .where(eq(shootingMechanicsBenchmarks.tier, tier));

  const minAngle = benchmark ? parseFloat(benchmark.minReleaseAngleDeg) : 46.0;
  const maxAngle = benchmark ? parseFloat(benchmark.maxReleaseAngleDeg) : 55.0;
  const maxElbow = benchmark ? parseFloat(benchmark.maxElbowFlareDeg) : 12.0;
  const minTime = benchmark ? parseFloat(benchmark.minReleaseTimeS) : 0.38;
  const maxTime = benchmark ? parseFloat(benchmark.maxReleaseTimeS) : 0.52;

  const observations: string[] = [];
  const cues: string[] = [];
  let scorePoints = 100;

  // 1. Release Angle
  if (input.releaseAngleDeg < minAngle) {
    observations.push(`Flat release angle (${input.releaseAngleDeg.toFixed(1)}° vs target ${minAngle}°-${maxAngle}°). Reduces effective basket target width.`);
    cues.push("Elevate finish through fingertips to increase ball arc");
    scorePoints -= 15;
  } else if (input.releaseAngleDeg > maxAngle) {
    observations.push(`High arc trajectory (${input.releaseAngleDeg.toFixed(1)}°). May increase vulnerability to wind in outdoor venues and depth variation.`);
    cues.push("Drive forward momentum into extension rather than straight upward push");
    scorePoints -= 10;
  } else {
    observations.push(`Optimal release angle (${input.releaseAngleDeg.toFixed(1)}° within target ${minAngle}°-${maxAngle}° band).`);
  }

  // 2. Set Point
  if (input.setPoint === "CHEST_LOW") {
    observations.push("Low chest set point observed. Susceptible to close-out block contest.");
    cues.push("Bring ball up through forehead corridor before forward wrist snap");
    scorePoints -= 20;
  } else if (input.setPoint === "ABOVE_BROW") {
    observations.push("High set point above brow provides optimal release height clearance.");
  }

  // 3. Elbow Flare
  if (input.elbowFlareDeg > maxElbow) {
    observations.push(`Shooting elbow flared outward (${input.elbowFlareDeg.toFixed(1)}° vs threshold <${maxElbow}°). Introduces lateral spin variance.`);
    cues.push("Tuck shooting elbow under ball alignment directly facing rim");
    scorePoints -= 15;
  } else {
    observations.push(`Clean elbow alignment (${input.elbowFlareDeg.toFixed(1)}° flare).`);
  }

  // 4. Release Quickness
  if (input.releaseTimeS > maxTime) {
    observations.push(`Slow gather-to-release duration (${input.releaseTimeS.toFixed(2)}s vs benchmark <${maxTime}s).`);
    cues.push("Dip and rise in single continuous fluid motion (one-motion energy transfer)");
    scorePoints -= 10;
  } else if (input.releaseTimeS < minTime) {
    observations.push(`Extremely rushed release (${input.releaseTimeS.toFixed(2)}s vs benchmark min ${minTime}s). Check for incomplete gather set.`);
    cues.push("Ensure full set point alignment before initiating extension");
    scorePoints -= 5;
  } else {
    observations.push(`Rapid release tempo (${input.releaseTimeS.toFixed(2)}s).`);
  }

  const confidence = 0.92;
  const status = scorePoints >= 70 ? "ACCEPTED" : "NEEDS_REVIEW";

  return {
    protocol: "SHOOTING_MECHANICS",
    status,
    confidence,
    sourceType: "CV_ESTIMATE",
    modelVersion: "court-iq-pose-v1.0",
    protocolVersion: "fiba-shooting-v1.0",
    metrics: {
      releaseAngleDeg: input.releaseAngleDeg,
      releaseTimeS: input.releaseTimeS,
      elbowFlareDeg: input.elbowFlareDeg,
      setPoint: input.setPoint,
      kinematicScore: Math.max(0, scorePoints),
      benchmarkTier: tier,
    },
    observations,
    coachingCues: cues,
    disclaimer: "Biomechanical observations are movement quality approximations and do not constitute clinical, orthopedic, or medical evaluation (ADR-0009).",
  };
}

/**
 * Evaluates basketball landing stability and deceleration symmetry (Spec §4.1).
 * Adheres strictly to ADR-0009: zero injury forecasts or ligament tear risk predictions.
 */
export async function analyzeLandingStability(input: LandingAnalysisInput) {
  const observations: string[] = [];
  const cues: string[] = [];
  let symmetryScore = 100;

  // Bilateral ground contact delta
  if (input.bilateralContactDiffMs > 60) {
    observations.push(`Marked bilateral landing delay (${input.bilateralContactDiffMs}ms difference between lead and trail foot). Preferential unilateral ground loading observed.`);
    cues.push("Focus on simultaneous two-foot quiet landing distribution");
    symmetryScore -= 25;
  } else if (input.bilateralContactDiffMs > 30) {
    observations.push(`Mild landing contact asymmetry (${input.bilateralContactDiffMs}ms delta).`);
    cues.push("Engage core to square hips before touchdown");
    symmetryScore -= 10;
  } else {
    observations.push(`Symmetrical simultaneous bilateral touchdown (${input.bilateralContactDiffMs}ms delta).`);
  }

  // Knee flexion depth (shock attenuation)
  if (input.kneeFlexionAtImpactDeg < 30) {
    observations.push(`Stiff-legged landing pattern (${input.kneeFlexionAtImpactDeg}° knee flexion). Limited eccentric shock absorption through lower kinetic chain.`);
    cues.push("Absorb ground impact through ankle, knee, and hip triple-flexion ('land like a ninja')");
    symmetryScore -= 20;
  } else {
    observations.push(`Adequate shock attenuation depth (${input.kneeFlexionAtImpactDeg}° knee flexion upon contact).`);
  }

  // Valgus collapse alignment
  if (input.valgusIndex === "NOTABLE_VALGUS") {
    observations.push("Medial knee displacement (dynamic valgus inward collapse) observed during landing deceleration.");
    cues.push("Drive knees outward in line with second toe upon landing; strengthen gluteus medius");
    symmetryScore -= 20;
  } else if (input.valgusIndex === "MILD_MEDIAL") {
    observations.push("Slight medial knee drift upon initial ground contact.");
  } else {
    observations.push("Stable frontal knee alignment over foot baseline throughout landing.");
  }

  const confidence = 0.89;
  const status = symmetryScore >= 70 ? "ACCEPTED" : "NEEDS_REVIEW";

  return {
    protocol: "LANDING_STABILITY",
    status,
    confidence,
    sourceType: "CV_ESTIMATE",
    modelVersion: "court-iq-pose-v1.0",
    protocolVersion: "fiba-landing-v1.0",
    metrics: {
      bilateralContactDiffMs: input.bilateralContactDiffMs,
      kneeFlexionAtImpactDeg: input.kneeFlexionAtImpactDeg,
      valgusIndex: input.valgusIndex,
      landingSymmetryIndex: Math.max(0, symmetryScore),
      jumpHeightCm: input.jumpHeightCm ?? null,
    },
    observations,
    coachingCues: cues,
    disclaimer: "Biomechanical observations are movement quality approximations and do not constitute clinical, orthopedic, or medical evaluation (ADR-0009).",
  };
}

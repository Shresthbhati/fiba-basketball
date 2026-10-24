import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  hostReviews,
  pickupGames,
  pickupParticipants,
  users,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";

export interface SubmitHostReviewInput {
  runHappened: boolean;
  rating: number; // 1 to 5
  punctuality?: "ON_TIME" | "SLIGHTLY_LATE" | "NO_SHOW" | undefined;
  competitionMatched?: boolean | undefined;
  feedbackNotes?: string | undefined;
}

export interface HostReliabilityMetrics {
  hostId: string;
  hostName: string;
  totalGamesHosted: number;
  completedGames: number;
  cancelledGames: number;
  completionRatePercent: number;
  reviewsCount: number;
  averageRating: number | null;
  runConfirmationPercent: number | null;
  onTimePercent: number | null;
  reliabilityScore: number; // 0 - 100
  hostTier: "PROVEN_COMMUNITY_LEADER" | "RELIABLE_HOST" | "ESTABLISHED_HOST" | "NEW_HOST" | "NEEDS_ATTENTION";
}

export async function submitHostReview(
  db: Db,
  gameId: string,
  reviewerId: string,
  input: SubmitHostReviewInput,
) {
  // 1. Fetch game
  const [game] = await db
    .select()
    .from(pickupGames)
    .where(eq(pickupGames.id, gameId));

  if (!game) {
    throw new AuthError(404, "Pickup game not found");
  }

  // A host cannot review their own game
  if (game.hostId === reviewerId) {
    throw new AuthError(400, "Hosts cannot submit reviews for their own runs");
  }

  // 2. Verify reviewer was a participant of the game
  const [participant] = await db
    .select()
    .from(pickupParticipants)
    .where(
      and(
        eq(pickupParticipants.gameId, gameId),
        eq(pickupParticipants.userId, reviewerId),
        inArray(pickupParticipants.status, ["CONFIRMED"]),
      ),
    );

  if (!participant) {
    throw new AuthError(403, "Only confirmed participants can review a hosted game");
  }

  // 3. Upsert review
  const [existing] = await db
    .select()
    .from(hostReviews)
    .where(
      and(
        eq(hostReviews.gameId, gameId),
        eq(hostReviews.reviewerId, reviewerId),
      ),
    );

  if (existing) {
    throw new AuthError(409, "You have already submitted a review for this game");
  }

  const [review] = await db
    .insert(hostReviews)
    .values({
      gameId,
      hostId: game.hostId,
      reviewerId,
      runHappened: input.runHappened,
      rating: Math.max(1, Math.min(5, input.rating)),
      punctuality: input.punctuality ?? "ON_TIME",
      competitionMatched: input.competitionMatched ?? true,
      feedbackNotes: input.feedbackNotes ?? null,
    })
    .returning();

  return review!;
}

export async function getHostReliability(
  db: Db,
  hostId: string,
): Promise<HostReliabilityMetrics> {
  const [hostUser] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, hostId));

  if (!hostUser) {
    throw new AuthError(404, "Host not found");
  }

  // Query games hosted
  const games = await db
    .select({ status: pickupGames.status })
    .from(pickupGames)
    .where(eq(pickupGames.hostId, hostId));

  const totalHosted = games.length;
  const completedCount = games.filter((g) => g.status === "COMPLETED").length;
  const cancelledCount = games.filter((g) => g.status === "CANCELLED").length;
  // Non-cancelled rate: games that were completed or are active/scheduled without host cancellation
  const completionRate =
    totalHosted > 0
      ? Math.round(((totalHosted - cancelledCount) / totalHosted) * 100)
      : 100;

  // Query reviews
  const reviews = await db
    .select()
    .from(hostReviews)
    .where(eq(hostReviews.hostId, hostId));

  const reviewsCount = reviews.length;
  let avgRating: number | null = null;
  let runConfirmationPercent: number | null = null;
  let onTimePercent: number | null = null;

  if (reviewsCount > 0) {
    const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
    avgRating = Math.round((totalRating / reviewsCount) * 10) / 10;

    const confirmedRuns = reviews.filter((r) => r.runHappened).length;
    runConfirmationPercent = Math.round((confirmedRuns / reviewsCount) * 100);

    const onTimeRuns = reviews.filter((r) => r.punctuality === "ON_TIME").length;
    onTimePercent = Math.round((onTimeRuns / reviewsCount) * 100);
  }

  // Reliability Score derivation:
  // Baseline 100 for new hosts with no negatives; weighted by completion and run confirmation
  let score = 100;
  if (totalHosted > 0 || reviewsCount > 0) {
    const completionWeight = 0.4 * completionRate;
    const confirmationWeight =
      runConfirmationPercent !== null ? 0.4 * runConfirmationPercent : 40;
    const ratingWeight = avgRating !== null ? 0.2 * (avgRating / 5) * 100 : 20;
    score = Math.round(completionWeight + confirmationWeight + ratingWeight);
  }

  let hostTier: HostReliabilityMetrics["hostTier"] = "NEW_HOST";
  if (totalHosted >= 10 && score >= 90) {
    hostTier = "PROVEN_COMMUNITY_LEADER";
  } else if (totalHosted >= 3 && score >= 80) {
    hostTier = "RELIABLE_HOST";
  } else if (totalHosted >= 3 && score >= 65) {
    hostTier = "ESTABLISHED_HOST";
  } else if (totalHosted >= 3 && score < 65) {
    hostTier = "NEEDS_ATTENTION";
  }

  return {
    hostId,
    hostName: hostUser.displayName,
    totalGamesHosted: totalHosted,
    completedGames: completedCount,
    cancelledGames: cancelledCount,
    completionRatePercent: completionRate,
    reviewsCount,
    averageRating: avgRating,
    runConfirmationPercent,
    onTimePercent,
    reliabilityScore: score,
    hostTier,
  };
}

export async function listHostReviews(db: Db, hostId: string) {
  const reviews = await db
    .select({
      id: hostReviews.id,
      gameId: hostReviews.gameId,
      runHappened: hostReviews.runHappened,
      rating: hostReviews.rating,
      punctuality: hostReviews.punctuality,
      competitionMatched: hostReviews.competitionMatched,
      feedbackNotes: hostReviews.feedbackNotes,
      createdAt: hostReviews.createdAt,
    })
    .from(hostReviews)
    .where(eq(hostReviews.hostId, hostId))
    .orderBy(desc(hostReviews.createdAt))
    .limit(20);

  return reviews;
}

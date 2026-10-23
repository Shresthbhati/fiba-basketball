import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  coachAssignments,
  assignmentSubmissions,
  roleAssignments,
  teams,
  users,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";

export type AssignmentType =
  | "FILM_STUDY"
  | "DRILL_PRACTICE"
  | "WORKOUT_PRESCRIPTION"
  | "MOVEMENT_ASSESSMENT";

export type AssignmentPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type AssignmentStatus = "ACTIVE" | "ARCHIVED";
export type SubmissionStatus = "SUBMITTED" | "REVIEWED" | "REVISION_REQUESTED";

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
}

export interface ResourceRef {
  type:
    | "FILM_CLIP"
    | "SCOUTING_MONTAGE"
    | "TACTICAL_PLAY"
    | "PRACTICE_DRILL"
    | "ASSESSMENT"
    | "WORKOUT";
  id: string;
  title?: string | undefined;
}

export interface CreateAssignmentInput {
  title: string;
  description?: string | undefined;
  type: AssignmentType;
  priority?: AssignmentPriority | undefined;
  dueAt?: string | undefined;
  resourceRef?: ResourceRef | undefined;
  quizQuestions?: QuizQuestion[] | undefined;
  targetAthleteIds?: string[] | undefined;
}

export interface SubmitAssignmentInput {
  answers: {
    selectedOptions?: Record<string, number> | undefined;
    athleteNotes?: string | undefined;
    resourceId?: string | undefined;
  };
}

export interface ReviewSubmissionInput {
  status: SubmissionStatus;
  coachNotes?: string | undefined;
  score?: number | undefined;
}

export async function canViewTeam(db: Db, userId: string, teamId: string): Promise<boolean> {
  const [t] = await db.select({ createdBy: teams.createdBy }).from(teams).where(eq(teams.id, teamId));
  if (!t) return false;
  if (t.createdBy === userId) return true;

  const [assignment] = await db
    .select()
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.userId, userId),
        eq(roleAssignments.resourceType, "team"),
        eq(roleAssignments.resourceId, teamId)
      )
    );

  return !!assignment;
}

export async function canManageTeam(db: Db, userId: string, teamId: string): Promise<boolean> {
  const [t] = await db.select({ createdBy: teams.createdBy }).from(teams).where(eq(teams.id, teamId));
  if (!t) return false;
  if (t.createdBy === userId) return true;

  const [coach] = await db
    .select()
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.userId, userId),
        eq(roleAssignments.resourceType, "team"),
        eq(roleAssignments.resourceId, teamId),
        eq(roleAssignments.role, "COACH")
      )
    );

  return !!coach;
}

export async function createAssignment(
  db: Db,
  userId: string,
  teamId: string,
  input: CreateAssignmentInput
) {
  const isCoach = await canManageTeam(db, userId, teamId);
  if (!isCoach) {
    throw new AuthError(404, "Team not found");
  }

  const [assignment] = await db
    .insert(coachAssignments)
    .values({
      teamId,
      coachId: userId,
      title: input.title,
      description: input.description ?? null,
      type: input.type,
      priority: input.priority ?? "NORMAL",
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      resourceRef: input.resourceRef ?? null,
      quizQuestions: input.quizQuestions ?? [],
      targetAthleteIds: input.targetAthleteIds ?? [],
      status: "ACTIVE",
    })
    .returning();

  return {
    id: assignment!.id,
    teamId: assignment!.teamId,
    coachId: assignment!.coachId,
    title: assignment!.title,
    description: assignment!.description,
    type: assignment!.type as AssignmentType,
    priority: assignment!.priority as AssignmentPriority,
    dueAt: assignment!.dueAt ? assignment!.dueAt.toISOString() : null,
    resourceRef: assignment!.resourceRef,
    quizQuestions: assignment!.quizQuestions,
    targetAthleteIds: assignment!.targetAthleteIds,
    status: assignment!.status as AssignmentStatus,
    createdAt: assignment!.createdAt.toISOString(),
    updatedAt: assignment!.updatedAt.toISOString(),
  };
}

export async function listAssignments(db: Db, userId: string, teamId: string) {
  const canView = await canViewTeam(db, userId, teamId);
  if (!canView) {
    throw new AuthError(404, "Team not found");
  }

  const isCoach = await canManageTeam(db, userId, teamId);

  const allAssignments = await db
    .select()
    .from(coachAssignments)
    .where(eq(coachAssignments.teamId, teamId))
    .orderBy(desc(coachAssignments.createdAt));

  // If coach, return all assignments with squad submission progress
  if (isCoach) {
    const assignmentIds = allAssignments.map((a) => a.id);
    let allSubmissions: Array<typeof assignmentSubmissions.$inferSelect> = [];
    if (assignmentIds.length > 0) {
      allSubmissions = await db
        .select()
        .from(assignmentSubmissions)
        .where(inArray(assignmentSubmissions.assignmentId, assignmentIds));
    }

    return allAssignments.map((a) => {
      const subs = allSubmissions.filter((s) => s.assignmentId === a.id);
      const submittedCount = subs.filter((s) => s.status === "SUBMITTED").length;
      const reviewedCount = subs.filter((s) => s.status === "REVIEWED").length;
      const revisionCount = subs.filter((s) => s.status === "REVISION_REQUESTED").length;
      return {
        id: a.id,
        teamId: a.teamId,
        coachId: a.coachId,
        title: a.title,
        description: a.description,
        type: a.type as AssignmentType,
        priority: a.priority as AssignmentPriority,
        dueAt: a.dueAt ? a.dueAt.toISOString() : null,
        resourceRef: a.resourceRef,
        quizQuestionsCount: a.quizQuestions.length,
        targetAthleteIds: a.targetAthleteIds,
        status: a.status as AssignmentStatus,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        stats: {
          totalSubmissions: subs.length,
          pendingReviewCount: submittedCount,
          reviewedCount,
          revisionCount,
        },
      };
    });
  }

  // If athlete, filter to assignments targeted to them (or whole team)
  const athleteAssignments = allAssignments.filter(
    (a) => a.targetAthleteIds.length === 0 || a.targetAthleteIds.includes(userId)
  );

  const assignmentIds = athleteAssignments.map((a) => a.id);
  let mySubmissions: Array<typeof assignmentSubmissions.$inferSelect> = [];
  if (assignmentIds.length > 0) {
    mySubmissions = await db
      .select()
      .from(assignmentSubmissions)
      .where(
        and(
          inArray(assignmentSubmissions.assignmentId, assignmentIds),
          eq(assignmentSubmissions.athleteId, userId)
        )
      );
  }

  return athleteAssignments.map((a) => {
    const mySub = mySubmissions.find((s) => s.assignmentId === a.id);
    return {
      id: a.id,
      teamId: a.teamId,
      coachId: a.coachId,
      title: a.title,
      description: a.description,
      type: a.type as AssignmentType,
      priority: a.priority as AssignmentPriority,
      dueAt: a.dueAt ? a.dueAt.toISOString() : null,
      resourceRef: a.resourceRef,
      quizQuestionsCount: a.quizQuestions.length,
      targetAthleteIds: a.targetAthleteIds,
      status: a.status as AssignmentStatus,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      submission: mySub
        ? {
            id: mySub.id,
            status: mySub.status,
            score: mySub.score,
            coachNotes: mySub.coachNotes,
            reviewedAt: mySub.reviewedAt ? mySub.reviewedAt.toISOString() : null,
            submittedAt: mySub.submittedAt.toISOString(),
          }
        : null,
    };
  });
}

export async function getAssignment(db: Db, userId: string, assignmentId: string) {
  const [assignment] = await db
    .select()
    .from(coachAssignments)
    .where(eq(coachAssignments.id, assignmentId));

  if (!assignment) {
    throw new AuthError(404, "Assignment not found");
  }

  const canView = await canViewTeam(db, userId, assignment.teamId);
  if (!canView) {
    throw new AuthError(404, "Assignment not found");
  }

  const isCoach = await canManageTeam(db, userId, assignment.teamId);

  // If not coach, ensure athlete is in target list (or target list is empty)
  if (!isCoach) {
    if (
      assignment.targetAthleteIds.length > 0 &&
      !assignment.targetAthleteIds.includes(userId)
    ) {
      throw new AuthError(404, "Assignment not found");
    }

    const [mySub] = await db
      .select()
      .from(assignmentSubmissions)
      .where(
        and(
          eq(assignmentSubmissions.assignmentId, assignmentId),
          eq(assignmentSubmissions.athleteId, userId)
        )
      );

    // If athlete hasn't completed quiz, hide the correct option index to protect quiz integrity
    const sanitizedQuestions = assignment.quizQuestions.map((q) => {
      if (mySub) {
        return q;
      }
      return {
        id: q.id,
        question: q.question,
        options: q.options,
      };
    });

    return {
      id: assignment.id,
      teamId: assignment.teamId,
      coachId: assignment.coachId,
      title: assignment.title,
      description: assignment.description,
      type: assignment.type as AssignmentType,
      priority: assignment.priority as AssignmentPriority,
      dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
      resourceRef: assignment.resourceRef,
      quizQuestions: sanitizedQuestions,
      targetAthleteIds: assignment.targetAthleteIds,
      status: assignment.status as AssignmentStatus,
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
      isCoach: false,
      submission: mySub
        ? {
            id: mySub.id,
            status: mySub.status,
            answers: mySub.answers,
            score: mySub.score,
            coachNotes: mySub.coachNotes,
            reviewedAt: mySub.reviewedAt ? mySub.reviewedAt.toISOString() : null,
            submittedAt: mySub.submittedAt.toISOString(),
          }
        : null,
    };
  }

  // Coach view: return assignment with all submissions and athlete details
  const subs = await db
    .select({
      id: assignmentSubmissions.id,
      assignmentId: assignmentSubmissions.assignmentId,
      athleteId: assignmentSubmissions.athleteId,
      athleteName: users.displayName,
      athleteEmail: users.email,
      status: assignmentSubmissions.status,
      answers: assignmentSubmissions.answers,
      score: assignmentSubmissions.score,
      coachNotes: assignmentSubmissions.coachNotes,
      reviewedBy: assignmentSubmissions.reviewedBy,
      reviewedAt: assignmentSubmissions.reviewedAt,
      submittedAt: assignmentSubmissions.submittedAt,
    })
    .from(assignmentSubmissions)
    .innerJoin(users, eq(assignmentSubmissions.athleteId, users.id))
    .where(eq(assignmentSubmissions.assignmentId, assignmentId))
    .orderBy(desc(assignmentSubmissions.submittedAt));

  return {
    id: assignment.id,
    teamId: assignment.teamId,
    coachId: assignment.coachId,
    title: assignment.title,
    description: assignment.description,
    type: assignment.type as AssignmentType,
    priority: assignment.priority as AssignmentPriority,
    dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
    resourceRef: assignment.resourceRef,
    quizQuestions: assignment.quizQuestions,
    targetAthleteIds: assignment.targetAthleteIds,
    status: assignment.status as AssignmentStatus,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
    isCoach: true,
    submissions: subs.map((s) => ({
      ...s,
      reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
      submittedAt: s.submittedAt.toISOString(),
    })),
  };
}

export async function submitAssignment(
  db: Db,
  userId: string,
  assignmentId: string,
  input: SubmitAssignmentInput
) {
  const [assignment] = await db
    .select()
    .from(coachAssignments)
    .where(eq(coachAssignments.id, assignmentId));

  if (!assignment) {
    throw new AuthError(404, "Assignment not found");
  }

  const canView = await canViewTeam(db, userId, assignment.teamId);
  if (!canView) {
    throw new AuthError(404, "Assignment not found");
  }

  if (
    assignment.targetAthleteIds.length > 0 &&
    !assignment.targetAthleteIds.includes(userId)
  ) {
    throw new AuthError(404, "Assignment not found");
  }

  // Automatic grading for quiz assignments
  let calculatedScore: number | null = null;
  if (
    assignment.quizQuestions &&
    assignment.quizQuestions.length > 0 &&
    input.answers.selectedOptions
  ) {
    let correct = 0;
    for (const q of assignment.quizQuestions) {
      const selected = input.answers.selectedOptions[q.id];
      if (selected !== undefined && selected === q.correctOptionIndex) {
        correct++;
      }
    }
    calculatedScore = Math.round((correct / assignment.quizQuestions.length) * 100);
  }

  const [existing] = await db
    .select()
    .from(assignmentSubmissions)
    .where(
      and(
        eq(assignmentSubmissions.assignmentId, assignmentId),
        eq(assignmentSubmissions.athleteId, userId)
      )
    );

  if (existing) {
    const [updated] = await db
      .update(assignmentSubmissions)
      .set({
        answers: input.answers,
        score: calculatedScore ?? existing.score,
        status: "SUBMITTED",
        submittedAt: new Date(),
      })
      .where(eq(assignmentSubmissions.id, existing.id))
      .returning();

    return {
      id: updated!.id,
      assignmentId: updated!.assignmentId,
      athleteId: updated!.athleteId,
      status: updated!.status as SubmissionStatus,
      answers: updated!.answers,
      score: updated!.score,
      submittedAt: updated!.submittedAt.toISOString(),
    };
  }

  const [created] = await db
    .insert(assignmentSubmissions)
    .values({
      assignmentId,
      athleteId: userId,
      status: "SUBMITTED",
      answers: input.answers,
      score: calculatedScore,
    })
    .returning();

  return {
    id: created!.id,
    assignmentId: created!.assignmentId,
    athleteId: created!.athleteId,
    status: created!.status as SubmissionStatus,
    answers: created!.answers,
    score: created!.score,
    submittedAt: created!.submittedAt.toISOString(),
  };
}

export async function reviewSubmission(
  db: Db,
  coachId: string,
  submissionId: string,
  input: ReviewSubmissionInput
) {
  const [submission] = await db
    .select()
    .from(assignmentSubmissions)
    .where(eq(assignmentSubmissions.id, submissionId));

  if (!submission) {
    throw new AuthError(404, "Submission not found");
  }

  const [assignment] = await db
    .select()
    .from(coachAssignments)
    .where(eq(coachAssignments.id, submission.assignmentId));

  if (!assignment) {
    throw new AuthError(404, "Submission not found");
  }

  const isCoach = await canManageTeam(db, coachId, assignment.teamId);
  if (!isCoach) {
    throw new AuthError(404, "Submission not found");
  }

  const [updated] = await db
    .update(assignmentSubmissions)
    .set({
      status: input.status,
      coachNotes: input.coachNotes !== undefined ? input.coachNotes : submission.coachNotes,
      score: input.score !== undefined ? input.score : submission.score,
      reviewedBy: coachId,
      reviewedAt: new Date(),
    })
    .where(eq(assignmentSubmissions.id, submissionId))
    .returning();

  return {
    id: updated!.id,
    assignmentId: updated!.assignmentId,
    athleteId: updated!.athleteId,
    status: updated!.status as SubmissionStatus,
    score: updated!.score,
    coachNotes: updated!.coachNotes,
    reviewedBy: updated!.reviewedBy,
    reviewedAt: updated!.reviewedAt ? updated!.reviewedAt.toISOString() : null,
    submittedAt: updated!.submittedAt.toISOString(),
  };
}

export async function getCoachDashboard(db: Db, coachId: string, teamId: string) {
  const isCoach = await canManageTeam(db, coachId, teamId);
  if (!isCoach) {
    throw new AuthError(404, "Team not found");
  }

  const assignments = await db
    .select()
    .from(coachAssignments)
    .where(eq(coachAssignments.teamId, teamId))
    .orderBy(desc(coachAssignments.createdAt));

  const assignmentIds = assignments.map((a) => a.id);

  let submissions: Array<
    typeof assignmentSubmissions.$inferSelect & {
      athleteName: string;
      athleteEmail: string;
    }
  > = [];

  if (assignmentIds.length > 0) {
    submissions = await db
      .select({
        id: assignmentSubmissions.id,
        assignmentId: assignmentSubmissions.assignmentId,
        athleteId: assignmentSubmissions.athleteId,
        athleteName: users.displayName,
        athleteEmail: users.email,
        status: assignmentSubmissions.status,
        answers: assignmentSubmissions.answers,
        score: assignmentSubmissions.score,
        coachNotes: assignmentSubmissions.coachNotes,
        reviewedBy: assignmentSubmissions.reviewedBy,
        reviewedAt: assignmentSubmissions.reviewedAt,
        submittedAt: assignmentSubmissions.submittedAt,
      })
      .from(assignmentSubmissions)
      .innerJoin(users, eq(assignmentSubmissions.athleteId, users.id))
      .where(inArray(assignmentSubmissions.assignmentId, assignmentIds))
      .orderBy(desc(assignmentSubmissions.submittedAt));
  }

  const openReviews = submissions
    .filter((s) => s.status === "SUBMITTED")
    .map((s) => {
      const parent = assignments.find((a) => a.id === s.assignmentId);
      return {
        id: s.id,
        assignmentId: s.assignmentId,
        assignmentTitle: parent?.title ?? "Untitled Assignment",
        assignmentType: parent?.type ?? "FILM_STUDY",
        priority: parent?.priority ?? "NORMAL",
        athleteId: s.athleteId,
        athleteName: s.athleteName,
        athleteEmail: s.athleteEmail,
        score: s.score,
        submittedAt: s.submittedAt.toISOString(),
      };
    });

  const now = new Date();
  const activeAssignments = assignments.filter((a) => a.status === "ACTIVE");
  const overdueAssignments = activeAssignments.filter((a) => a.dueAt && a.dueAt < now);

  // Calculate squad adherence rate
  let adherenceRate = 100;
  if (activeAssignments.length > 0) {
    const totalAssignmentsCount = activeAssignments.length;
    const completedOrReviewed = submissions.filter(
      (s) => s.status === "REVIEWED" || s.status === "SUBMITTED"
    ).length;
    // Estimated adherence normalized over total assignments
    adherenceRate = Math.min(100, Math.round((completedOrReviewed / Math.max(1, totalAssignmentsCount)) * 100));
  }

  return {
    teamId,
    activeAssignmentCount: activeAssignments.length,
    openReviewCount: openReviews.length,
    overdueCount: overdueAssignments.length,
    squadAdherenceRate: adherenceRate,
    reviewQueue: openReviews,
    recentActivity: submissions.slice(0, 10).map((s) => {
      const parent = assignments.find((a) => a.id === s.assignmentId);
      return {
        id: s.id,
        type: s.status === "REVIEWED" ? "REVIEW_COMPLETED" : "SUBMISSION_RECEIVED",
        assignmentTitle: parent?.title ?? "Assignment",
        athleteName: s.athleteName,
        status: s.status,
        score: s.score,
        timestamp: (s.reviewedAt ?? s.submittedAt).toISOString(),
      };
    }),
  };
}

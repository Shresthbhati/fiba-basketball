"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, EmptyState, StatCard } from "@courtiq/design-system";

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
  correctOptionIndex?: number;
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
  title?: string;
}

export interface AssignmentSubmission {
  id: string;
  status: SubmissionStatus;
  score?: number | null;
  coachNotes?: string | null;
  answers?: {
    selectedOptions?: Record<string, number>;
    athleteNotes?: string;
    resourceId?: string;
  };
  submittedAt: string;
  reviewedAt?: string | null;
}

export interface AssignmentItem {
  id: string;
  teamId: string;
  coachId: string;
  title: string;
  description?: string | null;
  type: AssignmentType;
  priority: AssignmentPriority;
  dueAt?: string | null;
  resourceRef?: ResourceRef | null;
  quizQuestions?: QuizQuestion[];
  quizQuestionsCount?: number;
  targetAthleteIds: string[];
  status: AssignmentStatus;
  createdAt: string;
  submission?: AssignmentSubmission | null;
  stats?: {
    totalSubmissions: number;
    pendingReviewCount: number;
    reviewedCount: number;
    revisionCount: number;
  };
}

export interface CoachAssignmentsProps {
  assignments: AssignmentItem[];
  isCoach?: boolean;
  teamId?: string;
  athleteId?: string;
  onSubmitAssignment?: (
    assignmentId: string,
    answers: { selectedOptions?: Record<string, number>; athleteNotes?: string }
  ) => Promise<void>;
  onCreateAssignment?: (payload: {
    title: string;
    description?: string;
    type: AssignmentType;
    priority: AssignmentPriority;
    dueAt?: string;
    resourceRef?: ResourceRef;
    quizQuestions?: Array<{ id: string; question: string; options: string[]; correctOptionIndex: number }>;
  }) => Promise<void>;
}

export function CoachAssignments({
  assignments,
  isCoach = false,
  teamId,
  onSubmitAssignment,
  onCreateAssignment,
}: CoachAssignmentsProps) {
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, Record<string, number>>>({});
  const [athleteNotes, setAthleteNotes] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // New assignment state
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<AssignmentType>("FILM_STUDY");
  const [newPriority, setNewPriority] = useState<AssignmentPriority>("NORMAL");
  const [newDueDate, setNewDueDate] = useState("");
  const [newResourceTitle, setNewResourceTitle] = useState("");
  const [newResourceId, setNewResourceId] = useState("");

  const filtered = assignments.filter((a) => {
    if (selectedType !== "ALL" && a.type !== selectedType) return false;
    if (selectedStatus === "PENDING" && a.submission) return false;
    if (selectedStatus === "SUBMITTED" && a.submission?.status !== "SUBMITTED") return false;
    if (selectedStatus === "REVIEWED" && a.submission?.status !== "REVIEWED") return false;
    return true;
  });

  const completedCount = assignments.filter((a) => !!a.submission).length;
  const pendingCount = assignments.filter((a) => !a.submission).length;

  const handleOptionSelect = (assignmentId: string, questionId: string, optionIndex: number) => {
    setQuizAnswers((prev) => ({
      ...prev,
      [assignmentId]: {
        ...(prev[assignmentId] || {}),
        [questionId]: optionIndex,
      },
    }));
  };

  const handleNotesChange = (assignmentId: string, text: string) => {
    setAthleteNotes((prev) => ({
      ...prev,
      [assignmentId]: text,
    }));
  };

  const handleSubmit = async (assignmentId: string) => {
    if (!onSubmitAssignment) return;
    setSubmittingId(assignmentId);
    try {
      await onSubmitAssignment(assignmentId, {
        selectedOptions: quizAnswers[assignmentId] || {},
        athleteNotes: athleteNotes[assignmentId] || "",
      });
      setActiveQuizId(null);
    } finally {
      setSubmittingId(null);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateAssignment || !newTitle.trim()) return;

    let resRef: ResourceRef | undefined;
    if (newResourceId.trim()) {
      resRef = {
        type:
          newType === "FILM_STUDY"
            ? "SCOUTING_MONTAGE"
            : newType === "DRILL_PRACTICE"
            ? "PRACTICE_DRILL"
            : newType === "MOVEMENT_ASSESSMENT"
            ? "ASSESSMENT"
            : "WORKOUT",
        id: newResourceId.trim(),
        title: newResourceTitle.trim() || undefined,
      };
    }

    await onCreateAssignment({
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      type: newType,
      priority: newPriority,
      dueAt: newDueDate ? new Date(newDueDate).toISOString() : undefined,
      resourceRef: resRef,
    });

    setIsCreateOpen(false);
    setNewTitle("");
    setNewDesc("");
    setNewResourceId("");
    setNewResourceTitle("");
  };

  const priorityColor: Record<AssignmentPriority, "danger" | "brand" | "neutral" | "success" | "warning" | "info"> = {
    LOW: "neutral",
    NORMAL: "neutral",
    HIGH: "warning",
    URGENT: "danger",
  };

  const typeLabels: Record<AssignmentType, { label: string; icon: string }> = {
    FILM_STUDY: { label: "Film Study", icon: "🎬" },
    DRILL_PRACTICE: { label: "Practice Drill", icon: "🏀" },
    WORKOUT_PRESCRIPTION: { label: "S&C Workout", icon: "🏋️" },
    MOVEMENT_ASSESSMENT: { label: "Movement Assessment", icon: "🔬" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header & Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
            {isCoach ? "Coach Assignment Hub" : "My Training Assignments"}
          </h1>
          <p style={{ margin: "4px 0 0 0", color: "var(--muted-foreground)", fontSize: 14 }}>
            Closed-loop intelligence connecting film room, practice court, and biomechanical feedback.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {isCoach && (
            <>
              {teamId && (
                <Link href={`/coach?teamId=${teamId}`}>
                  <Button variant="secondary">Go to Coach Queue</Button>
                </Link>
              )}
              <Button onClick={() => setIsCreateOpen(true)}>+ Create Assignment</Button>
            </>
          )}
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <StatCard label="Total Tasks" value={assignments.length} hint="Active assignments" />
        <StatCard
          label={isCoach ? "Completed Submissions" : "Completed Tasks"}
          value={completedCount}
          hint={isCoach ? "Athletes submitted" : "Submitted by you"}
        />
        <StatCard
          label="Pending Tasks"
          value={pendingCount}
          hint={isCoach ? "Awaiting athlete completion" : "Ready to complete"}
        />
        <StatCard
          label="Completion Rate"
          value={`${assignments.length > 0 ? Math.round((completedCount / assignments.length) * 100) : 100}%`}
          hint="Squad task adherence"
        />
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted-foreground)" }}>Type:</span>
        {(["ALL", "FILM_STUDY", "DRILL_PRACTICE", "WORKOUT_PRESCRIPTION", "MOVEMENT_ASSESSMENT"] as const).map(
          (t) => (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              style={{
                padding: "4px 12px",
                borderRadius: 20,
                border: "1px solid",
                borderColor: selectedType === t ? "var(--primary)" : "var(--border)",
                backgroundColor: selectedType === t ? "var(--primary)" : "transparent",
                color: selectedType === t ? "var(--primary-foreground)" : "var(--foreground)",
                fontSize: 13,
                cursor: "pointer",
                fontWeight: selectedType === t ? 600 : 400,
              }}
            >
              {t === "ALL" ? "All Types" : typeLabels[t].label}
            </button>
          )
        )}

        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted-foreground)", marginLeft: 12 }}>
          Status:
        </span>
        {(["ALL", "PENDING", "SUBMITTED", "REVIEWED"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSelectedStatus(s)}
            style={{
              padding: "4px 12px",
              borderRadius: 20,
              border: "1px solid",
              borderColor: selectedStatus === s ? "var(--primary)" : "var(--border)",
              backgroundColor: selectedStatus === s ? "var(--primary)" : "transparent",
              color: selectedStatus === s ? "var(--primary-foreground)" : "var(--foreground)",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: selectedStatus === s ? 600 : 400,
            }}
          >
            {s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Assignment List */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No assignments found"
          description={
            selectedType !== "ALL" || selectedStatus !== "ALL"
              ? "Try adjusting your filters to see more assignments."
              : "No coach assignments have been assigned to your squad yet."
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {filtered.map((item) => {
            const typeInfo = typeLabels[item.type] || { label: item.type, icon: "📋" };
            const isCompleted = !!item.submission;
            const isQuizOpen = activeQuizId === item.id;
            const questions = item.quizQuestions || [];

            return (
              <Card key={item.id} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Header row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 24 }}>{typeInfo.icon}</span>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--foreground)" }}>
                          {item.title}
                        </h3>
                        <Badge variant={priorityColor[item.priority]}>{item.priority}</Badge>
                        <Badge variant="neutral">{typeInfo.label}</Badge>
                      </div>
                      {item.dueAt && (
                        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                          Due: {new Date(item.dueAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div>
                    {item.submission ? (
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {item.submission.score !== null && item.submission.score !== undefined && (
                          <Badge variant="success">Score: {item.submission.score}%</Badge>
                        )}
                        <Badge
                          variant={
                            item.submission.status === "REVIEWED"
                              ? "success"
                              : item.submission.status === "REVISION_REQUESTED"
                              ? "warning"
                              : "neutral"
                          }
                        >
                          {item.submission.status === "REVIEWED"
                            ? "✓ Reviewed by Coach"
                            : item.submission.status === "REVISION_REQUESTED"
                            ? "⚠ Revision Requested"
                            : "Submitted"}
                        </Badge>
                      </div>
                    ) : (
                      <Badge variant="neutral">Pending</Badge>
                    )}
                  </div>
                </div>

                {/* Description */}
                {item.description && (
                  <p style={{ margin: 0, fontSize: 14, color: "var(--foreground)", lineHeight: 1.5 }}>
                    {item.description}
                  </p>
                )}

                {/* Linked Resource Launcher */}
                {item.resourceRef && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: 8,
                      backgroundColor: "var(--accent)",
                      border: "1px solid var(--border)",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16 }}>🔗</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        {item.resourceRef.title || `${item.resourceRef.type} Resource`}
                      </span>
                      <Badge variant="neutral">{item.resourceRef.type}</Badge>
                    </div>

                    <div>
                      {item.resourceRef.type === "SCOUTING_MONTAGE" || item.resourceRef.type === "FILM_CLIP" ? (
                        <Link href={`/film/search?montageId=${item.resourceRef.id}`}>
                          <Button variant="secondary" size="sm">Open in Film Room →</Button>
                        </Link>
                      ) : item.resourceRef.type === "TACTICAL_PLAY" ? (
                        <Link href={`/playbook?id=${item.resourceRef.id}`}>
                          <Button variant="secondary" size="sm">Open in Tactical Lab →</Button>
                        </Link>
                      ) : item.resourceRef.type === "PRACTICE_DRILL" ? (
                        <Link href="/practices">
                          <Button variant="secondary" size="sm">Open Drill Card →</Button>
                        </Link>
                      ) : item.resourceRef.type === "ASSESSMENT" ? (
                        <Link href={`/train/assessments/${item.resourceRef.id}`}>
                          <Button variant="secondary" size="sm">Open Movement Review →</Button>
                        </Link>
                      ) : null}
                    </div>
                  </div>
                )}

                {/* Coach Feedback if reviewed */}
                {item.submission?.coachNotes && (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      backgroundColor: "rgba(34, 197, 94, 0.08)",
                      border: "1px solid rgba(34, 197, 94, 0.25)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>
                      Coach Feedback Notes:
                    </span>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--foreground)", fontStyle: "italic" }}>
                      "{item.submission.coachNotes}"
                    </p>
                  </div>
                )}

                {/* Coach view stats */}
                {isCoach && item.stats && (
                  <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--muted-foreground)" }}>
                    <span>Total Submissions: <strong>{item.stats.totalSubmissions}</strong></span>
                    <span>Pending Review: <strong>{item.stats.pendingReviewCount}</strong></span>
                    <span>Reviewed: <strong>{item.stats.reviewedCount}</strong></span>
                  </div>
                )}

                {/* Athlete Action: Take Quiz or View Answers */}
                {!isCoach && (
                  <div>
                    {!isCompleted ? (
                      <div>
                        {questions.length > 0 && !isQuizOpen ? (
                          <Button onClick={() => setActiveQuizId(item.id)}>
                            Take Quiz & Complete ({questions.length} questions)
                          </Button>
                        ) : !isQuizOpen ? (
                          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            <Button onClick={() => setActiveQuizId(item.id)}>Complete Task</Button>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                        Completed on {new Date(item.submission!.submittedAt).toLocaleDateString()}
                      </span>
                    )}

                    {/* Interactive Submission Form */}
                    {isQuizOpen && !isCompleted && (
                      <div
                        style={{
                          marginTop: 14,
                          padding: 16,
                          borderRadius: 8,
                          backgroundColor: "var(--background)",
                          border: "1px solid var(--border)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 16,
                        }}
                      >
                        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                          {questions.length > 0 ? "Check for Understanding" : "Complete Task"}
                        </h4>

                        {questions.map((q, idx) => (
                          <div key={q.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 500 }}>
                              {idx + 1}. {q.question}
                            </span>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 8 }}>
                              {q.options.map((opt, oIdx) => {
                                const selected = quizAnswers[item.id]?.[q.id] === oIdx;
                                return (
                                  <label
                                    key={oIdx}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      fontSize: 13,
                                      cursor: "pointer",
                                    }}
                                  >
                                    <input
                                      type="radio"
                                      name={`quiz-${item.id}-${q.id}`}
                                      checked={selected}
                                      onChange={() => handleOptionSelect(item.id, q.id, oIdx)}
                                    />
                                    <span>{opt}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}

                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <label style={{ fontSize: 13, fontWeight: 500 }}>Notes / Takeaways (Optional):</label>
                          <textarea
                            rows={3}
                            placeholder="Add any notes on what you observed or questions for coach..."
                            value={athleteNotes[item.id] || ""}
                            onChange={(e) => handleNotesChange(item.id, e.target.value)}
                            style={{
                              width: "100%",
                              padding: "8px 12px",
                              borderRadius: 6,
                              border: "1px solid var(--border)",
                              backgroundColor: "var(--background)",
                              color: "var(--foreground)",
                              fontSize: 13,
                              boxSizing: "border-box",
                            }}
                          />
                        </div>

                        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                          <Button variant="ghost" onClick={() => setActiveQuizId(null)}>
                            Cancel
                          </Button>
                          <Button
                            disabled={submittingId === item.id}
                            onClick={() => handleSubmit(item.id)}
                          >
                            {submittingId === item.id ? "Submitting..." : "Submit Task"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Assignment Dialog */}
      {isCreateOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              backgroundColor: "var(--card)",
              borderRadius: 12,
              padding: 24,
              maxWidth: 520,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Create Coach Assignment</h2>
            <form onSubmit={handleCreateSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  Assignment Title:
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pick & Roll Drop Coverage Film Review"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  Assignment Type:
                </label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as AssignmentType)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="FILM_STUDY">Film Study</option>
                  <option value="DRILL_PRACTICE">Practice Drill</option>
                  <option value="WORKOUT_PRESCRIPTION">S&C Workout</option>
                  <option value="MOVEMENT_ASSESSMENT">Movement Assessment</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                    Priority:
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as AssignmentPriority)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                    Due Date:
                  </label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  Instructions / Description:
                </label>
                <textarea
                  rows={3}
                  placeholder="Outline key focus areas or objectives..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ padding: "10px 14px", backgroundColor: "var(--accent)", borderRadius: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  Linked Resource (Optional):
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Resource Label (e.g. High PNR Reel)"
                    value={newResourceTitle}
                    onChange={(e) => setNewResourceTitle(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      fontSize: 13,
                      boxSizing: "border-box",
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Resource UUID (e.g. from film, play, drill, or assessment)"
                    value={newResourceId}
                    onChange={(e) => setNewResourceId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      fontSize: 13,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
                <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create Assignment</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

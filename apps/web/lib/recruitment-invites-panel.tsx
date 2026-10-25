"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Select,
} from "@courtiq/design-system";
import { api } from "./api";

export interface RecruitmentInviteItem {
  id: string;
  pickupGameId: string;
  pickupGameTitle: string;
  playedStartsAt: string;
  courtName: string;
  coachId: string;
  coachName: string;
  teamId: string;
  teamName: string;
  inviteType: "TRYOUT" | "ROSTER_SPOT" | "DEVELOPMENT_SQUAD";
  message: string;
  tryoutDate: string | null;
  location: string | null;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
}

export function RecruitmentInvitesPanel() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "ACCEPTED" | "DECLINED">("ALL");
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ id: string; msg: string; type: "success" | "error" } | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery<{ items: RecruitmentInviteItem[] }>({
    queryKey: ["recruitment-invites", filter],
    queryFn: async () => {
      const q = filter !== "ALL" ? `?status=${filter}` : "";
      return api<{ items: RecruitmentInviteItem[] }>(`/recruitment/invites${q}`);
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      return api<{ id: string; status: string }>(`/recruitment/invites/${inviteId}/accept`, {
        method: "POST",
      });
    },
    onSuccess: (_, inviteId) => {
      setActionFeedback({
        id: inviteId,
        msg: "Invitation accepted! You have been added to the team roster.",
        type: "success",
      });
      void qc.invalidateQueries({ queryKey: ["recruitment-invites"] });
    },
    onError: (err: Error, inviteId) => {
      setActionFeedback({
        id: inviteId,
        msg: err.message || "Failed to accept invitation.",
        type: "error",
      });
    },
    onSettled: () => {
      setActingId(null);
    },
  });

  const declineMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      return api<{ id: string; status: string }>(`/recruitment/invites/${inviteId}/decline`, {
        method: "POST",
      });
    },
    onSuccess: (_, inviteId) => {
      setActionFeedback({
        id: inviteId,
        msg: "Invitation declined.",
        type: "success",
      });
      void qc.invalidateQueries({ queryKey: ["recruitment-invites"] });
    },
    onError: (err: Error, inviteId) => {
      setActionFeedback({
        id: inviteId,
        msg: err.message || "Failed to decline invitation.",
        type: "error",
      });
    },
    onSettled: () => {
      setActingId(null);
    },
  });

  function handleAccept(id: string) {
    setActingId(id);
    setActionFeedback(null);
    acceptMutation.mutate(id);
  }

  function handleDecline(id: string) {
    setActingId(id);
    setActionFeedback(null);
    declineMutation.mutate(id);
  }

  const items = data?.items ?? [];

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>Pickup Scouting Invitations</h2>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--muted, #94a3b8)" }}>
            Direct tryout and roster offers from coaches who scouted you during pickup games.
          </p>
        </div>

        {/* Filter buttons */}
        <div style={{ display: "flex", gap: "0.5rem" }} role="group" aria-label="Filter invitations">
          {(["ALL", "PENDING", "ACCEPTED", "DECLINED"] as const).map((tab) => (
            <Button
              key={tab}
              variant={filter === tab ? "primary" : "secondary"}
              size="sm"
              onClick={() => setFilter(tab)}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>
      </div>

      {isLoading && <LoadingState message="Loading scouting invitations..." />}

      {isError && (
        <ErrorState
          title="Could not load invitations"
          message={error instanceof Error ? error.message : "Network error"}
          onRetry={() => void refetch()}
        />
      )}

      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          title="No scouting invitations found"
          description={
            filter === "ALL"
              ? "When coaches watch your pickup runs and extend tryout or roster offers, they will appear here."
              : `You have no ${filter.toLowerCase()} invitations at this time.`
          }
        />
      )}

      {!isLoading && !isError && items.length > 0 && (
        <div style={{ display: "grid", gap: "1rem" }}>
          {items.map((inv) => {
            const isPending = inv.status === "PENDING";
            const isActing = actingId === inv.id;
            const feedback = actionFeedback?.id === inv.id ? actionFeedback : null;

            return (
              <Card key={inv.id} style={{ display: "grid", gap: "0.75rem", padding: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "1.125rem", fontWeight: 700 }}>{inv.teamName}</span>
                      <Badge
                        variant={
                          inv.inviteType === "ROSTER_SPOT"
                            ? "success"
                            : inv.inviteType === "TRYOUT"
                            ? "brand"
                            : "info"
                        }
                        size="sm"
                      >
                        {inv.inviteType.replace("_", " ")}
                      </Badge>
                      <Badge
                        variant={
                          inv.status === "ACCEPTED"
                            ? "success"
                            : inv.status === "DECLINED"
                            ? "danger"
                            : inv.status === "EXPIRED"
                            ? "neutral"
                            : "warning"
                        }
                        size="sm"
                      >
                        {inv.status}
                      </Badge>
                    </div>
                    <div style={{ fontSize: "0.875rem", color: "var(--muted, #94a3b8)", marginTop: "0.25rem" }}>
                      Scouted by <strong>{inv.coachName}</strong> at <em>{inv.pickupGameTitle}</em> ({inv.courtName})
                    </div>
                  </div>

                  <div style={{ fontSize: "0.75rem", color: "var(--muted, #94a3b8)", textAlign: "right" }}>
                    Sent {new Date(inv.createdAt).toLocaleDateString()}
                    {isPending && (
                      <div style={{ color: "#f59e0b", marginTop: "0.2rem" }}>
                        Expires {new Date(inv.expiresAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Message */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    borderLeft: "3px solid #f97316",
                    padding: "0.625rem 0.875rem",
                    borderRadius: "4px",
                    fontSize: "0.9375rem",
                    lineHeight: 1.5,
                  }}
                >
                  "{inv.message}"
                </div>

                {/* Event Details (Tryout date & Location) */}
                {(inv.tryoutDate || inv.location) && (
                  <div
                    style={{
                      display: "flex",
                      gap: "1.5rem",
                      flexWrap: "wrap",
                      fontSize: "0.875rem",
                      color: "var(--text-secondary, #cbd5e1)",
                      background: "rgba(0, 0, 0, 0.2)",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "4px",
                    }}
                  >
                    {inv.tryoutDate && (
                      <div>
                        <strong>Tryout Date:</strong>{" "}
                        {new Date(inv.tryoutDate).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </div>
                    )}
                    {inv.location && (
                      <div>
                        <strong>Location:</strong> {inv.location}
                      </div>
                    )}
                  </div>
                )}

                {/* Feedback message */}
                {feedback && (
                  <div
                    role="alert"
                    style={{
                      padding: "0.5rem 0.75rem",
                      borderRadius: "4px",
                      fontSize: "0.875rem",
                      background: feedback.type === "success" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                      color: feedback.type === "success" ? "#22c55e" : "#ef4444",
                    }}
                  >
                    {feedback.msg}
                  </div>
                )}

                {/* Actions for Pending Invites */}
                {isPending && (
                  <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem", justifyContent: "flex-end" }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isActing}
                      onClick={() => handleDecline(inv.id)}
                    >
                      Decline
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={isActing}
                      onClick={() => handleAccept(inv.id)}
                    >
                      {isActing ? "Processing..." : "Accept & Join Team"}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface PickupScoutModalProps {
  gameId: string;
  gameTitle: string;
  candidateUserId: string;
  candidateName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PickupScoutModal({
  gameId,
  gameTitle,
  candidateUserId,
  candidateName,
  isOpen,
  onClose,
  onSuccess,
}: PickupScoutModalProps) {
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [inviteType, setInviteType] = useState<"TRYOUT" | "ROSTER_SPOT" | "DEVELOPMENT_SQUAD">("TRYOUT");
  const [message, setMessage] = useState("");
  const [tryoutDate, setTryoutDate] = useState("");
  const [location, setLocation] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch coach's teams
  const { data: rosterData } = useQuery<{
    coachTeams: Array<{ id: string; name: string }>;
  }>({
    queryKey: ["pickup-scouting-roster", gameId],
    queryFn: async () => {
      return api<{ coachTeams: Array<{ id: string; name: string }> }>(`/pickup/${gameId}/scouting-roster`);
    },
    enabled: isOpen,
  });

  const coachTeams = rosterData?.coachTeams ?? [];
  const activeTeamId = selectedTeamId || (coachTeams[0]?.id ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!activeTeamId) {
      setErrorMsg("Please select a team to recruit for.");
      return;
    }

    if (message.trim().length < 5) {
      setErrorMsg("Please write a scouting note of at least 5 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api(`/pickup/${gameId}/scout-invites`, {
        method: "POST",
        body: JSON.stringify({
          athleteId: candidateUserId,
          teamId: activeTeamId,
          inviteType,
          message: message.trim(),
          tryoutDate: tryoutDate ? new Date(tryoutDate).toISOString() : undefined,
          location: location.trim() || undefined,
          expiresInDays: Number(expiresInDays) || 14,
        }),
      });

      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to send recruitment invitation.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title={`Scout & Invite: ${candidateName}`}
      description={`Extend a recruitment offer to ${candidateName} based on their performance in "${gameTitle}".`}
      actions={
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting || coachTeams.length === 0}>
            {isSubmitting ? "Sending..." : "Send Invitation"}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem", marginTop: "0.5rem" }}>
        {errorMsg && (
          <div role="alert" style={{ color: "#ef4444", fontSize: "0.875rem", background: "rgba(239, 68, 68, 0.1)", padding: "0.5rem", borderRadius: "4px" }}>
            {errorMsg}
          </div>
        )}

        {coachTeams.length === 0 ? (
          <p style={{ color: "var(--muted, #94a3b8)", fontSize: "0.875rem" }}>
            You do not currently manage any teams. Create a team or get coach permissions first to extend recruitment offers.
          </p>
        ) : (
          <>
            <div>
              <label htmlFor="team-select" style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                Select Team
              </label>
              <Select
                id="team-select"
                value={activeTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
              >
                {coachTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label htmlFor="invite-type" style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                Invitation Type
              </label>
              <Select
                id="invite-type"
                value={inviteType}
                onChange={(e) => setInviteType(e.target.value as "TRYOUT" | "ROSTER_SPOT" | "DEVELOPMENT_SQUAD")}
              >
                <option value="TRYOUT">Official Tryout Invitation</option>
                <option value="ROSTER_SPOT">Direct Roster Spot Offer</option>
                <option value="DEVELOPMENT_SQUAD">Development Squad Invitation</option>
              </Select>
            </div>

            <div>
              <label htmlFor="invite-msg" style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                Personal Scouting Note / Instructions
              </label>
              <textarea
                id="invite-msg"
                rows={3}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="E.g. Great defense and court awareness today. We would love to have you at our team tryouts next Tuesday."
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "6px",
                  background: "var(--input-bg, rgba(255, 255, 255, 0.05))",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                  color: "inherit",
                  fontFamily: "inherit",
                  fontSize: "0.875rem",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div>
                <label htmlFor="tryout-date" style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  Tryout Date (optional)
                </label>
                <Input
                  id="tryout-date"
                  type="datetime-local"
                  value={tryoutDate}
                  onChange={(e) => setTryoutDate(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="tryout-loc" style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  Location (optional)
                </label>
                <Input
                  id="tryout-loc"
                  type="text"
                  placeholder="E.g. Main Training Facility"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="expires-days" style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                Expires In (Days)
              </label>
              <Input
                id="expires-days"
                type="number"
                min={1}
                max={30}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
              />
            </div>
          </>
        )}
      </form>
    </Dialog>
  );
}

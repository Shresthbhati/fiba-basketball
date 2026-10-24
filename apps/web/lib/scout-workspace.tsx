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
  StatCard,
} from "@courtiq/design-system";
import { api } from "./api";

export interface TalentCandidate {
  athleteId: string;
  displayName: string;
  isMinor: boolean;
  stats: {
    gamesCount: number;
    pointsPerGame: number;
    fgPercentage: number | null;
    provenance: string;
  };
  combineTesting: {
    maxVerticalJumpCm: number | null;
    threeQuarterSprintSec: number | null;
    provenance: string;
  };
  provenanceNotice: string;
}

export interface ScoutShortlist {
  id: string;
  name: string;
  description: string | null;
  isSharedWithOrg: boolean;
  memberCount: number;
  createdAt: string;
}

export interface ShortlistDetail extends ScoutShortlist {
  members: Array<{
    id: string;
    athleteId: string;
    athleteName: string;
    evaluationTier: string;
    scoutNotes: string | null;
    addedAt: string;
  }>;
}

export function ScoutWorkspace() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"search" | "shortlists">("search");

  // Search filter state
  const [minVert, setMinVert] = useState("");
  const [maxSprint, setMaxSprint] = useState("");
  const [minPpg, setMinPpg] = useState("");

  // Shortlist state
  const [selectedShortlistId, setSelectedShortlistId] = useState<string | null>(null);
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");

  // Add to shortlist dialog state
  const [targetAthlete, setTargetAthlete] = useState<TalentCandidate | null>(null);
  const [targetListId, setTargetListId] = useState("");
  const [evalTier, setEvalTier] = useState("WATCHLIST");
  const [scoutNotes, setScoutNotes] = useState("");

  // Query: Search talent pool
  const talentQuery = useQuery<{ items: TalentCandidate[] }>({
    queryKey: ["scout-talent-search", minVert, maxSprint, minPpg],
    queryFn: () => {
      const params = new URLSearchParams();
      if (minVert) params.set("minVerticalJumpCm", minVert);
      if (maxSprint) params.set("maxSprintSeconds", maxSprint);
      if (minPpg) params.set("minPointsPerGame", minPpg);
      const queryStr = params.toString() ? `?${params.toString()}` : "";
      return api<{ items: TalentCandidate[] }>(`/scout/talent-search${queryStr}`);
    },
  });

  // Query: Shortlists
  const shortlistsQuery = useQuery<{ items: ScoutShortlist[] }>({
    queryKey: ["scout-shortlists"],
    queryFn: () => api<{ items: ScoutShortlist[] }>("/scout/shortlists"),
  });

  // Query: Selected Shortlist Detail
  const shortlistDetailQuery = useQuery<ShortlistDetail>({
    queryKey: ["scout-shortlist", selectedShortlistId],
    queryFn: () => api<ShortlistDetail>(`/scout/shortlists/${selectedShortlistId}`),
    enabled: !!selectedShortlistId,
  });

  // Mutation: Create Shortlist
  const createListMutation = useMutation({
    mutationFn: () =>
      api("/scout/shortlists", {
        method: "POST",
        body: JSON.stringify({
          name: newListName.trim(),
          description: newListDesc.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      setIsCreateListOpen(false);
      setNewListName("");
      setNewListDesc("");
      qc.invalidateQueries({ queryKey: ["scout-shortlists"] });
    },
  });

  // Mutation: Add member to shortlist
  const addMemberMutation = useMutation({
    mutationFn: () =>
      api(`/scout/shortlists/${targetListId}/members`, {
        method: "POST",
        body: JSON.stringify({
          athleteId: targetAthlete!.athleteId,
          evaluationTier: evalTier,
          scoutNotes: scoutNotes.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      setTargetAthlete(null);
      setScoutNotes("");
      qc.invalidateQueries({ queryKey: ["scout-shortlists"] });
      if (selectedShortlistId) {
        qc.invalidateQueries({ queryKey: ["scout-shortlist", selectedShortlistId] });
      }
    },
  });

  // Mutation: Remove member from shortlist
  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) =>
      api(`/scout/shortlists/${selectedShortlistId}/members/${memberId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scout-shortlist", selectedShortlistId] });
      qc.invalidateQueries({ queryKey: ["scout-shortlists"] });
    },
  });

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Scout Workspace</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 15 }}>
            Empirical talent discovery powered by verified official match events and calibrated combine benchmarks.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant={activeTab === "search" ? "primary" : "secondary"}
            onClick={() => setActiveTab("search")}
          >
            Talent Search
          </Button>
          <Button
            variant={activeTab === "shortlists" ? "primary" : "secondary"}
            onClick={() => setActiveTab("shortlists")}
          >
            Shortlists ({shortlistsQuery.data?.items.length ?? 0})
          </Button>
        </div>
      </div>

      {/* ADR-0008 & Minor Protection Notice */}
      <div
        style={{
          background: "var(--surface-raised)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "12px 16px",
          fontSize: 13,
          color: "var(--muted)",
          marginBottom: 20,
        }}
      >
        🔒 <strong>Scout Policy & Compliance:</strong> Minors under 18 are excluded from talent discovery by default. All prospect evaluations reflect empirical box scores (<code>OFFICIAL</code>) and calibrated instrument testing (<code>SENSOR</code>). Court IQ strictly prohibits synthetic "scout potential scores" and injury predictions.
      </div>

      {activeTab === "search" && (
        <>
          {/* Filters Bar */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
            <Input
              type="number"
              placeholder="Min Points Per Game (PPG)"
              value={minPpg}
              onChange={(e) => setMinPpg(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Min Max Vertical Jump (cm)"
              value={minVert}
              onChange={(e) => setMinVert(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Max 3/4 Sprint (seconds)"
              value={maxSprint}
              onChange={(e) => setMaxSprint(e.target.value)}
            />
          </div>

          {/* Candidates Grid */}
          {talentQuery.isLoading && <LoadingState message="Searching verified talent pool..." />}
          {talentQuery.isError && (
            <ErrorState
              title="Unable to load talent pool"
              message="Please verify your internet connection and try again."
              onRetry={() => talentQuery.refetch()}
            />
          )}

          {talentQuery.isSuccess && talentQuery.data.items.length === 0 && (
            <EmptyState
              title="No candidates match your criteria"
              description="Try lowering the metric thresholds or expanding the filter range."
            />
          )}

          {talentQuery.isSuccess && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
              {talentQuery.data.items.map((candidate) => (
                <Card key={candidate.athleteId}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{candidate.displayName}</h3>
                    <Badge variant="brand">Adult Prospect</Badge>
                  </div>

                  {/* Official Stats */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                      Official Competition Record ({candidate.stats.gamesCount} games)
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <StatCard
                        label="Scoring Avg"
                        value={`${candidate.stats.pointsPerGame} PPG`}
                        hint="Official match events"
                      />
                      <StatCard
                        label="FG Accuracy"
                        value={candidate.stats.fgPercentage !== null ? `${candidate.stats.fgPercentage}%` : "N/A"}
                        hint="Verified box score"
                      />
                    </div>
                  </div>

                  {/* Combine Benchmarks */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                      Calibrated Combine Testing
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <StatCard
                        label="Max Vertical"
                        value={candidate.combineTesting.maxVerticalJumpCm !== null ? `${candidate.combineTesting.maxVerticalJumpCm} cm` : "Not Tested"}
                        hint="Vertec / Optical sensor"
                      />
                      <StatCard
                        label="3/4 Sprint"
                        value={candidate.combineTesting.threeQuarterSprintSec !== null ? `${candidate.combineTesting.threeQuarterSprintSec}s` : "Not Tested"}
                        hint="Dual-beam gates"
                      />
                    </div>
                  </div>

                  <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                    <Button
                      variant="secondary"
                      style={{ width: "100%" }}
                      onClick={() => {
                        setTargetAthlete(candidate);
                        const firstList = shortlistsQuery.data?.items[0]?.id || "";
                        setTargetListId(firstList);
                      }}
                    >
                      + Add to Shortlist
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Shortlists Tab */}
      {activeTab === "shortlists" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>My Talent Shortlists</h2>
            <Button variant="primary" onClick={() => setIsCreateListOpen(true)}>
              + Create Shortlist
            </Button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
            {/* Sidebar list of shortlists */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {shortlistsQuery.data?.items.map((list) => (
                <div
                  key={list.id}
                  onClick={() => setSelectedShortlistId(list.id)}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 8,
                    cursor: "pointer",
                    border: "1px solid var(--border)",
                    background: selectedShortlistId === list.id ? "var(--brand-muted, rgba(37,99,235,0.1))" : "var(--surface)",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{list.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                    {list.memberCount} prospects • {new Date(list.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}

              {shortlistsQuery.data?.items.length === 0 && (
                <div style={{ fontSize: 13, color: "var(--muted)", padding: 12 }}>
                  No shortlists created yet.
                </div>
              )}
            </div>

            {/* Selected Shortlist Members */}
            <div>
              {selectedShortlistId && shortlistDetailQuery.data && (
                <Card>
                  <div style={{ marginBottom: 16 }}>
                    <h3 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
                      {shortlistDetailQuery.data.name}
                    </h3>
                    {shortlistDetailQuery.data.description && (
                      <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 14 }}>
                        {shortlistDetailQuery.data.description}
                      </p>
                    )}
                  </div>

                  {shortlistDetailQuery.data.members.length === 0 ? (
                    <EmptyState
                      title="Shortlist is empty"
                      description="Add prospects from the Talent Search tab to populate this list."
                    />
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {shortlistDetailQuery.data.members.map((m) => (
                        <div
                          key={m.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "10px 14px",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 15 }}>{m.athleteName}</div>
                            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
                              <Badge variant="brand">{m.evaluationTier}</Badge>
                              {m.scoutNotes && <span style={{ marginLeft: 8 }}>{m.scoutNotes}</span>}
                            </div>
                          </div>
                          <Button
                            variant="secondary"
                            onClick={() => removeMemberMutation.mutate(m.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {!selectedShortlistId && (
                <EmptyState
                  title="Select a shortlist"
                  description="Choose a shortlist from the left or create a new one to view saved prospects."
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Shortlist Dialog */}
      {isCreateListOpen && (
        <Dialog
          open={true}
          onClose={() => setIsCreateListOpen(false)}
          title="Create New Shortlist"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
                Shortlist Name
              </label>
              <Input
                placeholder="e.g. 2027 Point Guard Targets"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
                Description / Purpose
              </label>
              <Input
                placeholder="High-feel playmakers for tournament showcase"
                value={newListDesc}
                onChange={(e) => setNewListDesc(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
              <Button variant="secondary" onClick={() => setIsCreateListOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!newListName.trim() || createListMutation.isPending}
                onClick={() => createListMutation.mutate()}
              >
                {createListMutation.isPending ? "Creating..." : "Create Shortlist"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Add Member to Shortlist Dialog */}
      {targetAthlete && (
        <Dialog
          open={true}
          onClose={() => setTargetAthlete(null)}
          title={`Add ${targetAthlete.displayName} to Shortlist`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
                Select Shortlist
              </label>
              <Select
                value={targetListId}
                onChange={(e) => setTargetListId(e.target.value)}
                options={(shortlistsQuery.data?.items ?? []).map((l) => ({
                  label: l.name,
                  value: l.id,
                }))}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
                Evaluation Priority Tier
              </label>
              <Select
                value={evalTier}
                onChange={(e) => setEvalTier(e.target.value)}
                options={[
                  { label: "Watchlist", value: "WATCHLIST" },
                  { label: "High Priority", value: "HIGH_PRIORITY" },
                  { label: "Contacted", value: "CONTACTED" },
                  { label: "Offered", value: "OFFERED" },
                  { label: "Committed", value: "COMMITTED" },
                ]}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
                Private Scout Notes
              </label>
              <Input
                placeholder="Shooting mechanics in transition, handle under ball-pressure..."
                value={scoutNotes}
                onChange={(e) => setScoutNotes(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
              <Button variant="secondary" onClick={() => setTargetAthlete(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!targetListId || addMemberMutation.isPending}
                onClick={() => addMemberMutation.mutate()}
              >
                {addMemberMutation.isPending ? "Saving..." : "Add to Shortlist"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

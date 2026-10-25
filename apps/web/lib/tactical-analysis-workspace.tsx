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

export type WorkspaceTab = "candidates" | "similarity" | "simulator" | "models";

export interface TacticalCandidateEvent {
  id: string;
  gameId: string;
  clipId?: string | null;
  teamId: string;
  eventType: string;
  timestampSeconds: number;
  courtCoordinates: { x: number; y: number; endX?: number; endY?: number };
  involvedPlayerIds: string[];
  confidenceScore: number;
  status: "CANDIDATE" | "CONFIRMED" | "REJECTED" | "ADJUSTED";
  reviewedById?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  modelVersion: string;
  createdAt: string;
}

export interface PlaySimilarityMatch {
  play: {
    id: string;
    title: string;
    category: string;
    courtMode: string;
    tags: string[];
  };
  similarityScore: number;
  similarityPercent: number;
  spatialFeatures: {
    primaryAction: string;
    startQuadrant: string;
    endQuadrant: string;
    passCount: number;
    screenCount: number;
    trajectoryLengthMeters: number;
  };
}

export interface ScenarioSimulationResult {
  id: string;
  teamId: string;
  playId?: string | null;
  title: string;
  coverageType: string;
  simulationLevel: number;
  offensiveSetup: Record<string, unknown>;
  defensiveResponse: {
    coverageType: string;
    positions: Array<{ role: string; x: number; y: number }>;
    tacticalAdjustments?: string[];
  };
  coverageMetrics: {
    spaceAdvantageScore: number;
    contestedShotRisk: number;
    openLaneCount: number;
    secondaryHelpDelaySec: number;
  };
  tacticalAnalysis: string;
  disclaimer: string;
  createdAt: string;
}

export interface TacticalModel {
  id: string;
  modelVersion: string;
  modelType: string;
  benchmarkDataset: string;
  metrics: {
    accuracy: number;
    f1Score: number;
    precision: number;
    recall: number;
    sampleSize: number;
  };
  status: "CANDIDATE" | "ACTIVE" | "DEPRECATED" | "ROLLED_BACK";
  activeSince?: string | null;
  rolledBackAt?: string | null;
  rollbackReason?: string | null;
  createdAt: string;
}

interface TacticalWorkspaceProps {
  initialTeamId?: string;
}

export function TacticalAnalysisWorkspace({ initialTeamId }: TacticalWorkspaceProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("candidates");
  const [selectedTeamId, setSelectedTeamId] = useState<string>(initialTeamId ?? "");
  const [candidateFilterStatus, setCandidateFilterStatus] = useState<string>("ALL");
  const [minConfidence, setMinConfidence] = useState<number>(0.7);

  // Similarity Tab State
  const [selectedPlayId, setSelectedPlayId] = useState<string>("");

  // Simulator Tab State
  const [simTitle, setSimTitle] = useState<string>("Pick & Roll Defensive Coverage Test");
  const [simCoverage, setSimCoverage] = useState<string>("DROP");

  // Rollback Dialog State
  const [rollbackModelVersion, setRollbackModelVersion] = useState<string | null>(null);
  const [rollbackReasonText, setRollbackReasonText] = useState<string>("");

  // Fetch Teams
  const { data: teamsData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ["/api/v1/teams/mine"],
    queryFn: () => api("/api/v1/teams/mine"),
  });

  const teams = teamsData?.items ?? [];
  const activeTeamId = selectedTeamId || (teams[0]?.id ?? "");

  // 1. Fetch Candidates (WP-7.1)
  const {
    data: candidatesData,
    isLoading: isLoadingCandidates,
    isError: isErrorCandidates,
    refetch: refetchCandidates,
  } = useQuery<{ candidates: TacticalCandidateEvent[]; count: number }>({
    queryKey: ["tactical-candidates", activeTeamId, candidateFilterStatus, minConfidence],
    queryFn: () => {
      const params = new URLSearchParams();
      if (candidateFilterStatus !== "ALL") params.append("status", candidateFilterStatus);
      params.append("minConfidence", minConfidence.toString());
      return api(`/api/v1/tactical/teams/${activeTeamId}/candidates?${params.toString()}`);
    },
    enabled: !!activeTeamId && activeTab === "candidates",
  });

  // Review Candidate Mutation
  const reviewMutation = useMutation({
    mutationFn: ({ id, status, reviewNotes }: { id: string; status: string; reviewNotes?: string }) =>
      api(`/api/v1/tactical/candidates/${id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status, reviewNotes }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tactical-candidates"] });
    },
  });

  // 2. Fetch Team Plays for Similarity (WP-7.2)
  const { data: playsData } = useQuery<{ items: Array<{ id: string; title: string }> }>({
    queryKey: ["team-plays", activeTeamId],
    queryFn: () => api(`/api/v1/playbook/plays?teamId=${activeTeamId}`),
    enabled: !!activeTeamId && (activeTab === "similarity" || activeTab === "simulator"),
  });

  const plays = playsData?.items ?? [];

  // Query Similar Plays
  const {
    data: similarData,
    isLoading: isLoadingSimilar,
    refetch: refetchSimilar,
  } = useQuery<{ matches: PlaySimilarityMatch[]; total: number }>({
    queryKey: ["similar-plays", selectedPlayId],
    queryFn: () => api(`/api/v1/tactical/plays/${selectedPlayId}/similar`),
    enabled: !!selectedPlayId && activeTab === "similarity",
  });

  // Generate Play Embedding Mutation
  const embedMutation = useMutation({
    mutationFn: (playId: string) =>
      api(`/api/v1/tactical/plays/${playId}/embeddings`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["similar-plays", selectedPlayId] });
      refetchSimilar();
    },
  });

  // 3. Fetch Team Simulations (WP-7.3)
  const { data: simulationsData, isLoading: isLoadingSims } = useQuery<{
    simulations: ScenarioSimulationResult[];
    count: number;
  }>({
    queryKey: ["tactical-simulations", activeTeamId],
    queryFn: () => api(`/api/v1/tactical/teams/${activeTeamId}/simulations`),
    enabled: !!activeTeamId && activeTab === "simulator",
  });

  // Run Simulation Mutation
  const simulateMutation = useMutation({
    mutationFn: (input: { teamId: string; playId?: string; title: string; coverageType: string }) =>
      api("/api/v1/tactical/simulations", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tactical-simulations", activeTeamId] });
    },
  });

  // 4. Fetch Models (WP-7.4)
  const {
    data: modelsData,
    isLoading: isLoadingModels,
    refetch: refetchModels,
  } = useQuery<{ models: TacticalModel[]; count: number }>({
    queryKey: ["tactical-models"],
    queryFn: () => api("/api/v1/tactical/models"),
    enabled: activeTab === "models",
  });

  // Promote Model Mutation
  const promoteMutation = useMutation({
    mutationFn: (version: string) =>
      api(`/api/v1/tactical/models/${version}/promote`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tactical-models"] });
    },
  });

  // Rollback Model Mutation
  const rollbackMutation = useMutation({
    mutationFn: ({ version, reason }: { version: string; reason: string }) =>
      api(`/api/v1/tactical/models/${version}/rollback`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      setRollbackModelVersion(null);
      setRollbackReasonText("");
      queryClient.invalidateQueries({ queryKey: ["tactical-models"] });
    },
  });

  const getStatusBadgeVariant = (status: string): "brand" | "neutral" | "success" | "warning" | "danger" | "info" => {
    switch (status) {
      case "ACTIVE":
      case "CONFIRMED":
        return "success";
      case "CANDIDATE":
        return "brand";
      case "ADJUSTED":
        return "warning";
      case "REJECTED":
      case "ROLLED_BACK":
        return "danger";
      default:
        return "neutral";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Team Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">Tactical Intelligence & Simulation Lab</h1>
            <Badge variant="brand">Phase 7</Badge>
          </div>
          <p className="text-sm text-neutral-400 mt-1">
            Tracking candidate events, cosine concept similarity, Level 3 coverage simulator, and evaluated ML governance (Spec §7.2–§7.5, §12, ADR-0016).
          </p>
        </div>

        {teams.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-400">Team:</span>
            <Select
              value={activeTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="w-48 bg-neutral-900 text-white border-neutral-700"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-neutral-800 pb-2">
        <Button
          variant={activeTab === "candidates" ? "primary" : "ghost"}
          onClick={() => setActiveTab("candidates")}
        >
          Candidate Queue (WP-7.1)
        </Button>
        <Button
          variant={activeTab === "similarity" ? "primary" : "ghost"}
          onClick={() => setActiveTab("similarity")}
        >
          Play Similarity (WP-7.2)
        </Button>
        <Button
          variant={activeTab === "simulator" ? "primary" : "ghost"}
          onClick={() => setActiveTab("simulator")}
        >
          Coverage Simulator (WP-7.3)
        </Button>
        <Button
          variant={activeTab === "models" ? "primary" : "ghost"}
          onClick={() => setActiveTab("models")}
        >
          Model Registry (WP-7.4)
        </Button>
      </div>

      {/* TAB 1: CANDIDATES QUEUE */}
      {activeTab === "candidates" && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-neutral-900/60 p-4 rounded-lg border border-neutral-800">
            <div className="flex items-center gap-3">
              <span className="text-sm text-neutral-300">Filter Status:</span>
              <div className="flex gap-1">
                {["ALL", "CANDIDATE", "CONFIRMED", "REJECTED"].map((st) => (
                  <Button
                    key={st}
                    variant={candidateFilterStatus === st ? "primary" : "ghost"}
                    onClick={() => setCandidateFilterStatus(st)}
                  >
                    {st}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-neutral-400">Min Confidence:</span>
              <Select
                value={minConfidence.toString()}
                onChange={(e) => setMinConfidence(Number.parseFloat(e.target.value))}
                className="w-28 bg-neutral-900 border-neutral-700 text-sm"
              >
                <option value="0.5">50% +</option>
                <option value="0.7">70% +</option>
                <option value="0.85">85% +</option>
                <option value="0.9">90% +</option>
              </Select>
            </div>
          </div>

          {isLoadingCandidates ? (
            <LoadingState message="Loading candidate tracking events..." />
          ) : isErrorCandidates ? (
            <ErrorState
              title="Unable to load candidate events"
              message="Ensure your account has coaching permissions for this team."
              onRetry={() => { void refetchCandidates(); }}
            />
          ) : candidatesData && candidatesData.candidates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {candidatesData.candidates.map((cand) => (
                <Card key={cand.id} className="p-4 border-neutral-800 bg-neutral-950/70 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{cand.eventType.replace(/_/g, " ")}</span>
                        <Badge variant={getStatusBadgeVariant(cand.status)}>{cand.status}</Badge>
                      </div>
                      <p className="text-xs text-neutral-400 mt-1">
                        Video Offset: {cand.timestampSeconds.toFixed(1)}s • Model: {cand.modelVersion}
                      </p>
                    </div>
                    <Badge variant="info">
                      {Math.round(cand.confidenceScore * 100)}% Confidence
                    </Badge>
                  </div>

                  <div className="p-2.5 rounded bg-neutral-900 border border-neutral-800 text-xs text-neutral-300">
                    <div>Coordinates: ({cand.courtCoordinates.x.toFixed(1)}m, {cand.courtCoordinates.y.toFixed(1)}m)</div>
                    {cand.reviewNotes && (
                      <div className="mt-1 text-neutral-400">Note: {cand.reviewNotes}</div>
                    )}
                  </div>

                  {cand.status === "CANDIDATE" && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="primary"
                        onClick={() =>
                          reviewMutation.mutate({
                            id: cand.id,
                            status: "CONFIRMED",
                            reviewNotes: "Confirmed by coach review",
                          })
                        }
                        disabled={reviewMutation.isPending}
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() =>
                          reviewMutation.mutate({
                            id: cand.id,
                            status: "REJECTED",
                            reviewNotes: "Flagged as false positive noise",
                          })
                        }
                        disabled={reviewMutation.isPending}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No candidate events found"
              description="No automated optical tracking events matching your criteria in this queue."
            />
          )}
        </div>
      )}

      {/* TAB 2: PLAY SIMILARITY */}
      {activeTab === "similarity" && (
        <div className="space-y-6">
          <Card className="p-5 border-neutral-800 bg-neutral-900/40 space-y-4">
            <h3 className="text-lg font-semibold text-white">Cosine Concept Similarity Engine</h3>
            <p className="text-sm text-neutral-400">
              Select a tactical play to evaluate against spatial trajectory embeddings. Discovers matching actions, counters, and structural tendencies.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 items-center">
              <Select
                value={selectedPlayId}
                onChange={(e) => setSelectedPlayId(e.target.value)}
                className="w-full sm:w-80 bg-neutral-900 border-neutral-700 text-white"
              >
                <option value="">-- Choose Play from Playbook --</option>
                {plays.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>

              {selectedPlayId && (
                <Button
                  variant="secondary"
                  onClick={() => embedMutation.mutate(selectedPlayId)}
                  disabled={embedMutation.isPending}
                >
                  {embedMutation.isPending ? "Generating..." : "Regenerate Embedding"}
                </Button>
              )}
            </div>
          </Card>

          {isLoadingSimilar ? (
            <LoadingState message="Computing vector cosine distance..." />
          ) : similarData && similarData.matches.length > 0 ? (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
                Found {similarData.total} Similar Tactical Concepts
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {similarData.matches.map((match) => (
                  <Card key={match.play.id} className="p-4 border-neutral-800 bg-neutral-950/70 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-white">{match.play.title}</h4>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="neutral">{match.play.category}</Badge>
                          <Badge variant="neutral">{match.play.courtMode}</Badge>
                        </div>
                      </div>
                      <Badge variant="brand">{match.similarityPercent}% Match</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-neutral-900/60 p-2.5 rounded border border-neutral-800 text-neutral-300">
                      <div>Primary Action: <span className="text-white font-medium">{match.spatialFeatures.primaryAction}</span></div>
                      <div>Screens: <span className="text-white font-medium">{match.spatialFeatures.screenCount}</span></div>
                      <div>Passes: <span className="text-white font-medium">{match.spatialFeatures.passCount}</span></div>
                      <div>Distance: <span className="text-white font-medium">{match.spatialFeatures.trajectoryLengthMeters}m</span></div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ) : selectedPlayId ? (
            <EmptyState
              title="No similar plays found"
              description="No other plays in this playbook meet the minimum cosine similarity threshold."
            />
          ) : null}
        </div>
      )}

      {/* TAB 3: COVERAGE SIMULATOR */}
      {activeTab === "simulator" && (
        <div className="space-y-6">
          <Card className="p-5 border-neutral-800 bg-neutral-900/40 space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-white">Level 3 Rule-Based Scenario Simulator</h3>
                <Badge variant="warning">Spec §7.3</Badge>
              </div>
              <p className="text-xs text-neutral-400 mt-1">
                Explores defensive adjustments against offensive schemes using deterministic basketball coverage heuristics.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Simulation Title</label>
                <Input
                  value={simTitle}
                  onChange={(e) => setSimTitle(e.target.value)}
                  placeholder="e.g. Horns PnR vs Drop Coverage"
                />
              </div>

              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Defensive Coverage Strategy</label>
                <Select
                  value={simCoverage}
                  onChange={(e) => setSimCoverage(e.target.value)}
                  className="w-full bg-neutral-900 border-neutral-700 text-white"
                >
                  <option value="DROP">DROP (Protect paint, drop big)</option>
                  <option value="SWITCH">SWITCH (Exchange assignments on contact)</option>
                  <option value="BLITZ_TRAP">BLITZ / TRAP (Aggressive ball trap)</option>
                  <option value="HEDGE_AND_RECOVER">HEDGE & RECOVER (Hard hedge, scramble)</option>
                  <option value="ICE_WEAK">ICE (Deny middle, force baseline)</option>
                  <option value="HELP_AND_RECOVER">HELP & RECOVER (Weak-side tag, closeout)</option>
                </Select>
              </div>
            </div>

            <Button
              variant="primary"
              onClick={() =>
                simulateMutation.mutate({
                  teamId: activeTeamId,
                  title: simTitle,
                  coverageType: simCoverage,
                })
              }
              disabled={simulateMutation.isPending || !activeTeamId}
            >
              {simulateMutation.isPending ? "Simulating..." : "Run Scenario Simulation"}
            </Button>
          </Card>

          {/* Historical / Active Simulations */}
          {isLoadingSims ? (
            <LoadingState message="Loading simulated tactical scenarios..." />
          ) : simulationsData && simulationsData.simulations.length > 0 ? (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
                Simulated Tactical Scenarios ({simulationsData.count})
              </h4>

              <div className="space-y-4">
                {simulationsData.simulations.map((sim) => (
                  <Card key={sim.id} className="p-5 border-neutral-800 bg-neutral-950/70 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800/80 pb-3">
                      <div>
                        <h4 className="text-base font-bold text-white">{sim.title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="brand">{sim.coverageType}</Badge>
                          <span className="text-xs text-neutral-500">Level {sim.simulationLevel} Simulation</span>
                        </div>
                      </div>
                      <span className="text-xs text-neutral-500">
                        {new Date(sim.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Coverage Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-neutral-900 p-3 rounded border border-neutral-800">
                        <span className="text-xs text-neutral-400">Space Advantage</span>
                        <div className="text-xl font-bold text-emerald-400">
                          {sim.coverageMetrics.spaceAdvantageScore}/100
                        </div>
                      </div>
                      <div className="bg-neutral-900 p-3 rounded border border-neutral-800">
                        <span className="text-xs text-neutral-400">Contested Risk</span>
                        <div className="text-xl font-bold text-amber-400">
                          {sim.coverageMetrics.contestedShotRisk}/100
                        </div>
                      </div>
                      <div className="bg-neutral-900 p-3 rounded border border-neutral-800">
                        <span className="text-xs text-neutral-400">Open Passing Lanes</span>
                        <div className="text-xl font-bold text-white">
                          {sim.coverageMetrics.openLaneCount}
                        </div>
                      </div>
                      <div className="bg-neutral-900 p-3 rounded border border-neutral-800">
                        <span className="text-xs text-neutral-400">Secondary Help Delay</span>
                        <div className="text-xl font-bold text-white">
                          {sim.coverageMetrics.secondaryHelpDelaySec}s
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-neutral-900/80 rounded border border-neutral-800 text-sm text-neutral-200">
                      <span className="font-semibold text-neutral-400 block text-xs uppercase mb-1">
                        Tactical Analysis Breakdown:
                      </span>
                      {sim.tacticalAnalysis}
                    </div>

                    {/* Mandatory Disclaimer Badge */}
                    <div className="text-xs font-mono text-neutral-400 border border-neutral-800 bg-neutral-900/40 p-2.5 rounded">
                      ⚖️ {sim.disclaimer}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="No simulations executed"
              description="Run your first defensive coverage simulation above to explore tactical adjustments."
            />
          )}
        </div>
      )}

      {/* TAB 4: MODEL REGISTRY */}
      {activeTab === "models" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Audited Model Registry & Rollback Governance</h3>
              <p className="text-sm text-neutral-400">
                Transparent registry of evaluated computer-vision tracking, play embedding, and coverage models (Spec §12, ADR-0016).
              </p>
            </div>
            <Button variant="secondary" onClick={() => refetchModels()}>
              Refresh Catalog
            </Button>
          </div>

          {isLoadingModels ? (
            <LoadingState message="Loading model registry..." />
          ) : modelsData && modelsData.models.length > 0 ? (
            <div className="space-y-4">
              {modelsData.models.map((mod) => (
                <Card key={mod.id} className="p-5 border-neutral-800 bg-neutral-950/70 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800/80 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-bold text-white">Version {mod.modelVersion}</h4>
                        <Badge variant={getStatusBadgeVariant(mod.status)}>{mod.status}</Badge>
                        <Badge variant="neutral">{mod.modelType}</Badge>
                      </div>
                      <p className="text-xs text-neutral-400 mt-1">
                        Dataset: <span className="font-mono text-neutral-300">{mod.benchmarkDataset}</span>
                      </p>
                    </div>

                    <div className="flex gap-2">
                      {mod.status !== "ACTIVE" && mod.status !== "ROLLED_BACK" && (
                        <Button
                          variant="secondary"
                          onClick={() => promoteMutation.mutate(mod.modelVersion)}
                          disabled={promoteMutation.isPending}
                        >
                          Promote to Active
                        </Button>
                      )}

                      {mod.status === "ACTIVE" && (
                        <Button
                          variant="danger"
                          onClick={() => {
                            setRollbackModelVersion(mod.modelVersion);
                            setRollbackReasonText("");
                          }}
                        >
                          Rollback Model
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Benchmark Performance Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="bg-neutral-900 p-2.5 rounded border border-neutral-800">
                      <span className="text-neutral-400">Accuracy:</span>
                      <div className="text-base font-bold text-white">
                        {(mod.metrics.accuracy * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="bg-neutral-900 p-2.5 rounded border border-neutral-800">
                      <span className="text-neutral-400">F1 Score:</span>
                      <div className="text-base font-bold text-white">
                        {(mod.metrics.f1Score * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="bg-neutral-900 p-2.5 rounded border border-neutral-800">
                      <span className="text-neutral-400">Precision / Recall:</span>
                      <div className="text-base font-bold text-white">
                        {(mod.metrics.precision * 100).toFixed(0)}% / {(mod.metrics.recall * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="bg-neutral-900 p-2.5 rounded border border-neutral-800">
                      <span className="text-neutral-400">Eval Sample Size:</span>
                      <div className="text-base font-bold text-white">
                        {mod.metrics.sampleSize} sequences
                      </div>
                    </div>
                  </div>

                  {mod.rollbackReason && (
                    <div className="p-2.5 bg-red-950/30 border border-red-900/50 rounded text-xs text-red-200">
                      <span className="font-semibold">Rollback Justification:</span> {mod.rollbackReason}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No models cataloged"
              description="No tactical machine learning or heuristic models registered in this environment."
            />
          )}
        </div>
      )}

      {/* Rollback Confirmation Modal */}
      {rollbackModelVersion && (
        <Dialog
          open={!!rollbackModelVersion}
          title={`Rollback Model ${rollbackModelVersion}`}
          onClose={() => setRollbackModelVersion(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-neutral-300">
              Rolling back model <span className="font-bold text-white">{rollbackModelVersion}</span> will immediately deactivate it in production and reactivate the prior benchmarked version.
            </p>

            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Audit Rollback Reason</label>
              <Input
                value={rollbackReasonText}
                onChange={(e) => setRollbackReasonText(e.target.value)}
                placeholder="e.g. Precision drop observed on high-post action sequences"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setRollbackModelVersion(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() =>
                  rollbackMutation.mutate({
                    version: rollbackModelVersion,
                    reason: rollbackReasonText || "Manual regression rollback",
                  })
                }
                disabled={rollbackMutation.isPending}
              >
                {rollbackMutation.isPending ? "Rolling back..." : "Confirm Rollback"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

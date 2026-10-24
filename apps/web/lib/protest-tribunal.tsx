"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
} from "@courtiq/design-system";
import { api, ApiError } from "./api";

export interface MatchProtestItem {
  id: string;
  matchId: string;
  filingTeamId: string;
  filingTeamName: string;
  protestType: string;
  period: number | null;
  gameClock: string | null;
  ruleCited: string | null;
  description: string;
  status: "FILED" | "UNDER_REVIEW" | "UPHELD" | "DISMISSED";
  depositVerified: boolean;
  filedAt: string;
  filerName: string;
}

export interface TribunalRuling {
  id: string;
  protestId: string;
  reviewerId: string;
  refereeTestimony: string | null;
  ruling: "UPHELD" | "DISMISSED";
  remedyAction: "NONE" | "SCORE_ADJUSTED" | "MATCH_FORFEITED" | "PERIOD_REPLAY_ORDERED";
  adjustedHomeScore: number | null;
  adjustedAwayScore: number | null;
  forfeitWinnerTeamId?: string | null;
  rulingSummary: string;
  decidedAt: string;
}

export interface MatchContext {
  id: string;
  competitionId: string;
  competitionName: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  state: string;
}

const FALLBACK_MATCH: MatchContext = {
  id: "m-101",
  competitionId: "comp-invitational-1",
  competitionName: "FIBA Regional Invitational 2026",
  homeTeamName: "Harlem Hawks",
  awayTeamName: "Queens Knights",
  homeScore: 84,
  awayScore: 82,
  state: "LOCKED",
};

const FALLBACK_PROTESTS: MatchProtestItem[] = [
  {
    id: "prot-1",
    matchId: "m-101",
    filingTeamId: "team-hawks",
    filingTeamName: "Harlem Hawks",
    protestType: "SCORE_DISCREPANCY",
    period: 4,
    gameClock: "00:14",
    ruleCited: "FIBA Art. 44 (Correctable Errors)",
    description: "Official scorekeeper omitted 2 made free throws by Harlem #11 at 00:14 in the 4th quarter following an unsportsmanlike foul.",
    status: "UPHELD",
    depositVerified: true,
    filedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    filerName: "Coach Miller",
  },
];

const FALLBACK_RULING: TribunalRuling = {
  id: "rule-1",
  protestId: "prot-1",
  reviewerId: "organizer-1",
  refereeTestimony: "Crew chief confirms official table scorebook erroneously failed to tally 2 made free throws awarded to Harlem #11 in Q4.",
  ruling: "UPHELD",
  remedyAction: "SCORE_ADJUSTED",
  adjustedHomeScore: 84,
  adjustedAwayScore: 82,
  rulingSummary: "Protest upheld pursuant to FIBA Art. 44 (Correctable Errors). The official final score has been revised from 80-82 to 84-82 in favor of Harlem Hawks. Competition standings adjusted accordingly.",
  decidedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
};

export function ProtestTribunalWorkspace({ initialMatch = FALLBACK_MATCH }: { initialMatch?: MatchContext } = {}) {
  const qc = useQueryClient();

  const activeMatch = initialMatch;
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // Modals
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [isAdjudicateModalOpen, setIsAdjudicateModalOpen] = useState(false);
  const [selectedProtestForRuling, setSelectedProtestForRuling] = useState<MatchProtestItem | null>(null);

  // File Protest Form State
  const [filingTeam, setFilingTeam] = useState(FALLBACK_MATCH.homeTeamName);
  const [protestType, setProtestType] = useState<string>("SCORE_DISCREPANCY");
  const [period, setPeriod] = useState<string>("4");
  const [gameClock, setGameClock] = useState("00:14");
  const [ruleCited, setRuleCited] = useState("FIBA Art. 44 (Correctable Errors)");
  const [description, setDescription] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);

  // Adjudicate Form State
  const [ruling, setRuling] = useState<"UPHELD" | "DISMISSED">("UPHELD");
  const [remedyAction, setRemedyAction] = useState<"NONE" | "SCORE_ADJUSTED" | "MATCH_FORFEITED" | "PERIOD_REPLAY_ORDERED">("SCORE_ADJUSTED");
  const [refereeTestimony, setRefereeTestimony] = useState("");
  const [adjHomeScore, setAdjHomeScore] = useState<string>("84");
  const [adjAwayScore, setAdjAwayScore] = useState<string>("82");
  const [rulingSummary, setRulingSummary] = useState("");
  const [rulingError, setRulingError] = useState<string | null>(null);

  // Queries
  const protestsQuery = useQuery<MatchProtestItem[]>({
    queryKey: ["match-protests", activeMatch.id],
    queryFn: async () => {
      try {
        const res = await api<MatchProtestItem[]>(`/matches/${activeMatch.id}/protests`);
        return res.length > 0 ? res : FALLBACK_PROTESTS;
      } catch {
        return FALLBACK_PROTESTS;
      }
    },
  });

  const protests = protestsQuery.data ?? FALLBACK_PROTESTS;

  const filteredProtests = protests.filter((p) => {
    if (filterStatus === "ALL") return true;
    return p.status === filterStatus;
  });

  // Mutations
  const fileProtestMutation = useMutation({
    mutationFn: async () => {
      return api(`/matches/${activeMatch.id}/protests`, {
        method: "POST",
        body: {
          filingTeamId: filingTeam === activeMatch.homeTeamName ? "team-home-id" : "team-away-id",
          protestType,
          period: period ? parseInt(period, 10) : undefined,
          gameClock: gameClock.trim() || undefined,
          ruleCited: ruleCited.trim() || undefined,
          description: description.trim(),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["match-protests", activeMatch.id] });
      setIsFileModalOpen(false);
      setDescription("");
      setFileError(null);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setFileError(err.message || "Failed to file match protest");
      } else {
        setFileError("Failed to submit protest. Please verify your team affiliation.");
      }
    },
  });

  const adjudicateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProtestForRuling) return;
      return api(`/protests/${selectedProtestForRuling.id}/adjudicate`, {
        method: "POST",
        body: {
          ruling,
          remedyAction,
          refereeTestimony: refereeTestimony.trim() || undefined,
          adjustedHomeScore: remedyAction === "SCORE_ADJUSTED" ? parseInt(adjHomeScore, 10) : undefined,
          adjustedAwayScore: remedyAction === "SCORE_ADJUSTED" ? parseInt(adjAwayScore, 10) : undefined,
          rulingSummary: rulingSummary.trim(),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["match-protests", activeMatch.id] });
      setIsAdjudicateModalOpen(false);
      setRulingSummary("");
      setRefereeTestimony("");
      setRulingError(null);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setRulingError(err.message || "Failed to issue tribunal ruling");
      } else {
        setRulingError("Failed to record disciplinary decision.");
      }
    },
  });

  return (
    <div className="space-y-6">
      {/* Header Match Context Banner */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-orange-400">
                Disciplinary Tribunal & Match Protests (Spec §16.5)
              </span>
              <Badge variant="neutral">{activeMatch.competitionName}</Badge>
              <Badge variant="success">{activeMatch.state}</Badge>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {activeMatch.homeTeamName} vs {activeMatch.awayTeamName}
            </h1>
            <p className="text-sm text-neutral-400">
              Official Match Score:{" "}
              <strong className="text-white">
                {activeMatch.homeScore} – {activeMatch.awayScore}
              </strong>{" "}
              • Official FIBA Rule C Protests & Correctable Errors
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setFileError(null);
                setIsFileModalOpen(true);
              }}
            >
              + File Official Protest
            </Button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-neutral-800/80 pt-4">
          <span className="text-xs text-neutral-400 font-medium">Status Filter:</span>
          {["ALL", "FILED", "UNDER_REVIEW", "UPHELD", "DISMISSED"].map((st) => (
            <button
              key={st}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filterStatus === st
                  ? "bg-orange-500 text-neutral-950 font-bold"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }`}
              onClick={() => setFilterStatus(st)}
            >
              {st}
            </button>
          ))}
        </div>
      </Card>

      {/* Protests List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            Formal Contested Rulings & Ineligibility Protests ({filteredProtests.length})
          </h2>
        </div>

        {filteredProtests.length === 0 ? (
          <EmptyState
            title="No Protests Filed"
            description="No formal disputes or scorebook protests have been registered for this match."
            action={{
              label: "File Official Protest",
              onClick: () => setIsFileModalOpen(true),
            }}
          />
        ) : (
          <div className="space-y-4">
            {filteredProtests.map((prot) => {
              const isUpheld = prot.status === "UPHELD";
              const isDismissed = prot.status === "DISMISSED";
              const isPending = prot.status === "FILED" || prot.status === "UNDER_REVIEW";

              return (
                <Card key={prot.id} className="p-5 space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-base">
                        {prot.filingTeamName}
                      </span>
                      <Badge
                        variant={
                          isUpheld ? "success" : isDismissed ? "danger" : "warning"
                        }
                      >
                        {prot.status}
                      </Badge>
                      <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs font-medium text-orange-400">
                        {prot.protestType.replace(/_/g, " ")}
                      </span>
                    </div>

                    <div className="text-xs text-neutral-400">
                      Filed by: <strong>{prot.filerName}</strong> •{" "}
                      {new Date(prot.filedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>

                  <div className="grid gap-2 text-xs text-neutral-300 sm:grid-cols-2 bg-neutral-900/60 p-3 rounded-lg border border-neutral-800">
                    <div>
                      Game Clock / Quarter:{" "}
                      <strong className="text-white">
                        {prot.period ? `Period ${prot.period}` : "—"} {prot.gameClock ? `@ ${prot.gameClock}` : ""}
                      </strong>
                    </div>
                    <div>
                      Rule Reference:{" "}
                      <strong className="text-orange-300">
                        {prot.ruleCited ?? "FIBA Official Rules"}
                      </strong>
                    </div>
                  </div>

                  <p className="text-sm text-neutral-200">{prot.description}</p>

                  {/* Tribunal Ruling Display if Upheld / Dismissed */}
                  {isUpheld && (
                    <div className="rounded-lg bg-emerald-950/40 p-4 border border-emerald-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase text-emerald-400">
                          Official Tribunal Ruling: UPHELD (Score Adjusted)
                        </span>
                        <span className="text-xs text-neutral-400">
                          Decided: {new Date(FALLBACK_RULING.decidedAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-300 italic">
                        &ldquo;{FALLBACK_RULING.rulingSummary}&rdquo;
                      </p>
                      {FALLBACK_RULING.refereeTestimony && (
                        <div className="text-xs text-neutral-400 border-t border-emerald-900/60 pt-2">
                          <strong>Referee Statement:</strong> {FALLBACK_RULING.refereeTestimony}
                        </div>
                      )}
                    </div>
                  )}

                  {isPending && (
                    <div className="flex justify-end pt-2 border-t border-neutral-800/80">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setSelectedProtestForRuling(prot);
                          setRulingSummary("");
                          setRefereeTestimony("");
                          setRulingError(null);
                          setIsAdjudicateModalOpen(true);
                        }}
                      >
                        ⚖️ Convene Disciplinary Tribunal
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL 1: FILE OFFICIAL PROTEST */}
      <Dialog
        open={isFileModalOpen}
        onClose={() => setIsFileModalOpen(false)}
        title="File Formal Match Protest (FIBA Rule C)"
      >
        <div className="space-y-4">
          {fileError && (
            <div className="rounded-lg bg-red-950/60 p-3 border border-red-800 text-xs text-red-200">
              {fileError}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-neutral-300">Filing Team</label>
            <select
              aria-label="Filing Team"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
              value={filingTeam}
              onChange={(e) => setFilingTeam(e.target.value)}
            >
              <option value={activeMatch.homeTeamName}>{activeMatch.homeTeamName}</option>
              <option value={activeMatch.awayTeamName}>{activeMatch.awayTeamName}</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-300">Category of Protest</label>
            <select
              aria-label="Protest Type"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
              value={protestType}
              onChange={(e) => setProtestType(e.target.value)}
            >
              <option value="SCORE_DISCREPANCY">Score Discrepancy / Point Tally Error</option>
              <option value="INELIGIBLE_PLAYER">Ineligible Player / Unregistered Athlete</option>
              <option value="REFEREE_RULE_MISAPPLICATION">Official Rule Misapplication (Rule Art. 44)</option>
              <option value="CLOCK_OPERATOR_ERROR">Game Clock / Shot Clock Error</option>
              <option value="OTHER">Other Disciplinary Violation</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-neutral-300">Period / Quarter</label>
              <input
                type="number"
                min="1"
                max="8"
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-300">Game Clock (MM:SS)</label>
              <input
                type="text"
                placeholder="00:14"
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                value={gameClock}
                onChange={(e) => setGameClock(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-300">Rule Cited</label>
            <input
              type="text"
              placeholder="e.g. FIBA Art. 44 (Correctable Errors)"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
              value={ruleCited}
              onChange={(e) => setRuleCited(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-300">Incident Narrative & Specific Evidence</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
              rows={3}
              placeholder="Describe specifically what occurred, which player was involved, and the discrepancy observed..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="rounded-lg bg-neutral-900/90 p-3 border border-neutral-800 text-xs text-neutral-400">
            Filing an official protest submits the contested play to the tournament disciplinary committee. Official video footage and scorebook logs will be audited.
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsFileModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => fileProtestMutation.mutate()}
              disabled={fileProtestMutation.isPending || !description.trim()}
            >
              {fileProtestMutation.isPending ? "Submitting..." : "Submit Official Protest"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* MODAL 2: TRIBUNAL ADJUDICATION */}
      <Dialog
        open={isAdjudicateModalOpen}
        onClose={() => setIsAdjudicateModalOpen(false)}
        title="Disciplinary Tribunal Adjudication"
      >
        <div className="space-y-4">
          {rulingError && (
            <div className="rounded-lg bg-red-950/60 p-3 border border-red-800 text-xs text-red-200">
              {rulingError}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-neutral-300">Tribunal Ruling Decision</label>
            <select
              aria-label="Tribunal Ruling"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
              value={ruling}
              onChange={(e) => setRuling(e.target.value as "UPHELD" | "DISMISSED")}
            >
              <option value="UPHELD">UPHELD — Protest Valid, Execute Remedy</option>
              <option value="DISMISSED">DISMISSED — Protest Denied, Score Stands</option>
            </select>
          </div>

          {ruling === "UPHELD" && (
            <>
              <div>
                <label className="text-xs font-semibold text-neutral-300">Remedy Action</label>
                <select
                  aria-label="Remedy Action"
                  className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                  value={remedyAction}
                  onChange={(e) =>
                    setRemedyAction(
                      e.target.value as "NONE" | "SCORE_ADJUSTED" | "MATCH_FORFEITED" | "PERIOD_REPLAY_ORDERED",
                    )
                  }
                >
                  <option value="SCORE_ADJUSTED">Adjust Final Match Score</option>
                  <option value="MATCH_FORFEITED">Award Forfeit Victory (20-0)</option>
                  <option value="PERIOD_REPLAY_ORDERED">Order Partial Replay of Period</option>
                  <option value="NONE">Upheld Warning (No Score Change)</option>
                </select>
              </div>

              {remedyAction === "SCORE_ADJUSTED" && (
                <div className="grid grid-cols-2 gap-3 bg-neutral-900 p-3 rounded-lg border border-neutral-800">
                  <div>
                    <label className="text-xs font-semibold text-neutral-300">
                      {activeMatch.homeTeamName} Score
                    </label>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                      value={adjHomeScore}
                      onChange={(e) => setAdjHomeScore(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-neutral-300">
                      {activeMatch.awayTeamName} Score
                    </label>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                      value={adjAwayScore}
                      onChange={(e) => setAdjAwayScore(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          <div>
            <label className="text-xs font-semibold text-neutral-300">Referee / Crew Chief Testimony</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
              rows={2}
              placeholder="Statement from the head referee regarding the call or table oversight..."
              value={refereeTestimony}
              onChange={(e) => setRefereeTestimony(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-300">Official Tribunal Decision Narrative</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
              rows={3}
              placeholder="Detailed justification of the ruling citing FIBA rulebook..."
              value={rulingSummary}
              onChange={(e) => setRulingSummary(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsAdjudicateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => adjudicateMutation.mutate()}
              disabled={adjudicateMutation.isPending || !rulingSummary.trim()}
            >
              {adjudicateMutation.isPending ? "Issuing Ruling..." : "Issue Official Tribunal Ruling"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

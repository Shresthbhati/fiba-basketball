"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Input,
  LoadingState,
  Select,
} from "@courtiq/design-system";
import { api, ApiError, type Me } from "./api";

export interface AssignedMatchItem {
  id: string;
  competitionId: string;
  competitionName: string;
  round: number;
  slot: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  state: "SCHEDULED" | "LIVE" | "FINISHED" | "LOCKED" | "POSTPONED" | "CANCELLED" | "FORFEITED";
  scheduledAt: string | null;
  pregameCompleted: boolean;
  signedOff: boolean;
}

export interface PregameChecklistData {
  id?: string;
  matchId?: string;
  courtSurfaceSafe: boolean;
  perimeterRunoffClear: boolean;
  gameBallPressureChecked: boolean;
  gameClockTested: boolean;
  shotClockTested: boolean;
  jerseyContrastVerified: boolean;
  tableCrewConfirmed: boolean;
  notes?: string | null;
}

export function RefereeWorkspace() {
  const qc = useQueryClient();
  const [filterState, setFilterState] = useState("ALL");

  // Pre-game modal
  const [activePregameMatch, setActivePregameMatch] = useState<AssignedMatchItem | null>(null);
  const [courtSafe, setCourtSafe] = useState(true);
  const [runoffClear, setRunoffClear] = useState(true);
  const [ballPressure, setBallPressure] = useState(true);
  const [gameClock, setGameClock] = useState(true);
  const [shotClock, setShotClock] = useState(true);
  const [jerseyContrast, setJerseyContrast] = useState(true);
  const [tableCrew, setTableCrew] = useState(true);
  const [pregameNotes, setPregameNotes] = useState("");
  const [pregameError, setPregameError] = useState<string | null>(null);

  // Incident modal
  const [activeIncidentMatch, setActiveIncidentMatch] = useState<AssignedMatchItem | null>(null);
  const [incidentType, setIncidentType] = useState<
    "TECHNICAL_FOUL" | "UNSPORTSMANLIKE_FOUL" | "DISQUALIFYING_FOUL" | "EJECTION" | "PROTEST" | "DELAY_INCIDENT"
  >("TECHNICAL_FOUL");
  const [period, setPeriod] = useState("1");
  const [clockTime, setClockTime] = useState("05:00");
  const [incidentDesc, setIncidentDesc] = useState("");
  const [ruleRef, setRuleRef] = useState("FIBA Rule 36 (Technical Foul)");
  const [incidentError, setIncidentError] = useState<string | null>(null);

  // Sign-off modal
  const [activeSignoffMatch, setActiveSignoffMatch] = useState<AssignedMatchItem | null>(null);
  const [isCrewChief, setIsCrewChief] = useState(true);
  const [scoreVerified, setScoreVerified] = useState(true);
  const [scorebookAudited, setScorebookAudited] = useState(true);
  const [signoffNotes, setSignoffNotes] = useState("");
  const [signoffError, setSignoffError] = useState<string | null>(null);

  // Current user
  const { data: me } = useQuery<Me | null>({
    queryKey: ["me"],
    queryFn: () => api<Me>("/me").catch(() => null),
  });

  // Query assigned matches
  const { data: matchesData, isLoading } = useQuery<{ items: AssignedMatchItem[] }>({
    queryKey: ["referee-matches"],
    queryFn: () => api<{ items: AssignedMatchItem[] }>("/referee/matches"),
    enabled: !!me,
  });

  const matches = matchesData?.items ?? [];

  const filteredMatches = useMemo(() => {
    if (filterState === "ALL") return matches;
    return matches.filter((m) => m.state === filterState);
  }, [matches, filterState]);

  // Mutations
  const pregameMutation = useMutation({
    mutationFn: async () => {
      if (!activePregameMatch) throw new Error("No match selected");
      return api(`/matches/${activePregameMatch.id}/pregame`, {
        method: "POST",
        body: {
          courtSurfaceSafe: courtSafe,
          perimeterRunoffClear: runoffClear,
          gameBallPressureChecked: ballPressure,
          gameClockTested: gameClock,
          shotClockTested: shotClock,
          jerseyContrastVerified: jerseyContrast,
          tableCrewConfirmed: tableCrew,
          notes: pregameNotes.trim() ? pregameNotes.trim() : undefined,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referee-matches"] });
      setActivePregameMatch(null);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setPregameError(err.message);
      } else {
        setPregameError("Failed to save pregame checklist.");
      }
    },
  });

  const incidentMutation = useMutation({
    mutationFn: async () => {
      if (!activeIncidentMatch) throw new Error("No match selected");
      return api(`/matches/${activeIncidentMatch.id}/incidents`, {
        method: "POST",
        body: {
          incidentType,
          period: Number(period) || 1,
          gameClockTime: clockTime.trim() || undefined,
          description: incidentDesc.trim(),
          ruleReference: ruleRef.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      setActiveIncidentMatch(null);
      setIncidentDesc("");
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setIncidentError(err.message);
      } else {
        setIncidentError("Failed to file incident report.");
      }
    },
  });

  const signoffMutation = useMutation({
    mutationFn: async () => {
      if (!activeSignoffMatch) throw new Error("No match selected");
      return api(`/matches/${activeSignoffMatch.id}/signoff`, {
        method: "POST",
        body: {
          isCrewChief,
          finalScoreVerified: scoreVerified,
          scorebookAudited,
          refereeNotes: signoffNotes.trim() ? signoffNotes.trim() : undefined,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referee-matches"] });
      setActiveSignoffMatch(null);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setSignoffError(err.message);
      } else {
        setSignoffError("Failed to sign off on match.");
      }
    },
  });

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Referee Workspace & Officiating Hub</h1>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.95rem" }}>
            Official FIBA protocol verification, pre-game safety checklists, incident logging, and digital scorebook sign-off.
          </p>
        </div>

        <div style={{ minWidth: 160 }}>
          <Select
            label="Filter Match State"
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            options={[
              { value: "ALL", label: "All Assigned Matches" },
              { value: "SCHEDULED", label: "Scheduled / Upcoming" },
              { value: "LIVE", label: "Live Matches" },
              { value: "FINISHED", label: "Finished (Needs Sign-Off)" },
              { value: "LOCKED", label: "Locked & Completed" },
            ]}
          />
        </div>
      </div>

      {/* Assigned Matches Grid */}
      {isLoading ? (
        <LoadingState message="Loading your assigned matches..." />
      ) : filteredMatches.length === 0 ? (
        <EmptyState
          title="No assigned matches"
          description={
            filterState !== "ALL"
              ? "No assigned matches matching this filter."
              : "You have no referee assignments for upcoming competitions. Contact the tournament director to be assigned as an official."
          }
        />
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {filteredMatches.map((m) => {
            const isFinished = m.state === "FINISHED";
            const isLocked = m.state === "LOCKED";
            return (
              <Card
                key={m.id}
                title={`${m.homeTeam} vs ${m.awayTeam}`}
                badge={
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Badge variant={isLocked ? "success" : isFinished ? "brand" : "neutral"}>
                      {m.state}
                    </Badge>
                    <Badge variant={m.pregameCompleted ? "success" : "warning"}>
                      {m.pregameCompleted ? "✓ Pre-game Done" : "⚠️ Pre-game Pending"}
                    </Badge>
                    {isLocked && <Badge variant="info">🔒 Officially Locked</Badge>}
                  </div>
                }
                actions={
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setPregameError(null);
                        setActivePregameMatch(m);
                      }}
                    >
                      Pre-game Safety
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setIncidentError(null);
                        setActiveIncidentMatch(m);
                      }}
                    >
                      Log Incident
                    </Button>
                    {isFinished && !m.signedOff && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setSignoffError(null);
                          setActiveSignoffMatch(m);
                        }}
                      >
                        Official Sign-Off
                      </Button>
                    )}
                  </div>
                }
              >
                <div style={{ display: "grid", gap: 8, fontSize: "0.88rem" }}>
                  <div style={{ display: "flex", gap: 16, color: "var(--muted)", fontSize: "0.82rem" }}>
                    <span>🏆 {m.competitionName} (R{m.round} · Slot {m.slot})</span>
                    {m.scheduledAt && (
                      <span>🕒 {new Date(m.scheduledAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    )}
                  </div>

                  <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                    {m.homeScore !== null && m.awayScore !== null ? (
                      <span>
                        {m.homeTeam} {m.homeScore} – {m.awayScore} {m.awayTeam}
                      </span>
                    ) : (
                      <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Score not recorded yet</span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pre-Game Checklist Dialog */}
      <Dialog
        open={!!activePregameMatch}
        onClose={() => setActivePregameMatch(null)}
        title="FIBA Pre-Game Safety & Protocol Verification"
        description={`Match: ${activePregameMatch?.homeTeam} vs ${activePregameMatch?.awayTeam} (${activePregameMatch?.competitionName})`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPregameError(null);
            pregameMutation.mutate();
          }}
          style={{ display: "grid", gap: 12 }}
        >
          {pregameError && (
            <div
              role="alert"
              style={{
                padding: "8px 12px",
                background: "rgba(239, 68, 68, 0.15)",
                color: "#f87171",
                borderRadius: 6,
                fontSize: "0.85rem",
              }}
            >
              {pregameError}
            </div>
          )}

          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={courtSafe}
              onChange={(e) => setCourtSafe(e.target.checked)}
            />
            <span>Court floor clean, dry, and free of moisture / debris</span>
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={runoffClear}
              onChange={(e) => setRunoffClear(e.target.checked)}
            />
            <span>Perimeter run-off zone clear (FIBA 2.0m unobstructed perimeter)</span>
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={ballPressure}
              onChange={(e) => setBallPressure(e.target.checked)}
            />
            <span>Game balls inspected & pressure checked (0.55–0.65 bar / 7.5–8.5 psi)</span>
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={gameClock}
              onChange={(e) => setGameClock(e.target.checked)}
            />
            <span>Main scoreboard & game countdown clock operational test passed</span>
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={shotClock}
              onChange={(e) => setShotClock(e.target.checked)}
            />
            <span>24-second / 14-second shot clocks synchronized and operational</span>
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={jerseyContrast}
              onChange={(e) => setJerseyContrast(e.target.checked)}
            />
            <span>Team jersey contrast confirmed (Light home vs Dark away)</span>
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={tableCrew}
              onChange={(e) => setTableCrew(e.target.checked)}
            />
            <span>Scorer table crew confirmed (Scorekeeper, Timekeeper, Shot-clock operator)</span>
          </label>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 4 }}>
              Referee Pre-game Notes (Optional)
            </label>
            <textarea
              value={pregameNotes}
              onChange={(e) => setPregameNotes(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="e.g. South hoop net replaced prior to tipoff; game ball Molten BG5000..."
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 6,
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                fontSize: "0.85rem",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setActivePregameMatch(null)}
              disabled={pregameMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={pregameMutation.isPending}>
              Save Checklist
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Incident Report Dialog */}
      <Dialog
        open={!!activeIncidentMatch}
        onClose={() => setActiveIncidentMatch(null)}
        title="File Disciplinary / Incident Report"
        description={`Log official incident for ${activeIncidentMatch?.homeTeam} vs ${activeIncidentMatch?.awayTeam}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setIncidentError(null);
            incidentMutation.mutate();
          }}
          style={{ display: "grid", gap: 12 }}
        >
          {incidentError && (
            <div
              role="alert"
              style={{
                padding: "8px 12px",
                background: "rgba(239, 68, 68, 0.15)",
                color: "#f87171",
                borderRadius: 6,
                fontSize: "0.85rem",
              }}
            >
              {incidentError}
            </div>
          )}

          <Select
            label="Incident Category"
            value={incidentType}
            onChange={(e) => setIncidentType(e.target.value as typeof incidentType)}
            options={[
              { value: "TECHNICAL_FOUL", label: "Technical Foul (T-Foul)" },
              { value: "UNSPORTSMANLIKE_FOUL", label: "Unsportsmanlike Foul (U-Foul)" },
              { value: "DISQUALIFYING_FOUL", label: "Disqualifying Foul (D-Foul)" },
              { value: "EJECTION", label: "Player / Coach Ejection" },
              { value: "PROTEST", label: "Official Match Protest" },
              { value: "DELAY_INCIDENT", label: "Severe Delay / External Incident" },
            ]}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Select
              label="Quarter / Period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              options={[
                { value: "1", label: "Q1" },
                { value: "2", label: "Q2" },
                { value: "3", label: "Q3" },
                { value: "4", label: "Q4" },
                { value: "5", label: "OT 1" },
              ]}
            />
            <Input
              label="Game Clock (MM:SS)"
              value={clockTime}
              onChange={(e) => setClockTime(e.target.value)}
              placeholder="04:30"
              required
            />
          </div>

          <Input
            label="Rule Reference"
            value={ruleRef}
            onChange={(e) => setRuleRef(e.target.value)}
            placeholder="FIBA Rule 36 (Technical Foul)"
          />

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 4 }}>
              Incident Summary & Referee Report
            </label>
            <textarea
              value={incidentDesc}
              onChange={(e) => setIncidentDesc(e.target.value)}
              rows={3}
              required
              minLength={5}
              maxLength={2000}
              placeholder="Detail participant number, nature of infraction, verbal warning status, and penalty administered..."
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 6,
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                fontSize: "0.85rem",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setActiveIncidentMatch(null)}
              disabled={incidentMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={incidentMutation.isPending}>
              Submit Incident Report
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Official Sign-off Dialog */}
      <Dialog
        open={!!activeSignoffMatch}
        onClose={() => setActiveSignoffMatch(null)}
        title="Official Scorebook Verification & Sign-Off"
        description={`Final Score: ${activeSignoffMatch?.homeTeam} ${activeSignoffMatch?.homeScore} – ${activeSignoffMatch?.awayScore} ${activeSignoffMatch?.awayTeam}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSignoffError(null);
            signoffMutation.mutate();
          }}
          style={{ display: "grid", gap: 14 }}
        >
          {signoffError && (
            <div
              role="alert"
              style={{
                padding: "8px 12px",
                background: "rgba(239, 68, 68, 0.15)",
                color: "#f87171",
                borderRadius: 6,
                fontSize: "0.85rem",
              }}
            >
              {signoffError}
            </div>
          )}

          <div
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              padding: 12,
              borderRadius: 8,
              border: "1px solid rgba(255, 255, 255, 0.1)",
              fontSize: "0.88rem",
            }}
          >
            <strong>Official Confirmation:</strong>
            <p style={{ margin: "4px 0 0 0", color: "var(--muted)", lineHeight: 1.4 }}>
              Signing off certifies that the scorebook events, team fouls, player point totals, and period outcomes were recorded accurately. This action will permanently lock the match and update official tournament standings.
            </p>
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={scoreVerified}
              onChange={(e) => setScoreVerified(e.target.checked)}
            />
            <span>Final score and winner certified per official FIBA scorebook</span>
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={scorebookAudited}
              onChange={(e) => setScorebookAudited(e.target.checked)}
            />
            <span>Player personal fouls and disqualifications audited</span>
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={isCrewChief}
              onChange={(e) => setIsCrewChief(e.target.checked)}
            />
            <span>I am signing as Crew Chief / Lead Official</span>
          </label>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 4 }}>
              Referee Sign-Off Comments (Optional)
            </label>
            <textarea
              value={signoffNotes}
              onChange={(e) => setSignoffNotes(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="e.g. Game concluded in good order, no protests filed..."
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 6,
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                fontSize: "0.85rem",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setActiveSignoffMatch(null)}
              disabled={signoffMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={signoffMutation.isPending}>
              Confirm Sign-Off & Lock Match
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import type { CommandCenterData, DelayImpactPreview } from "./competition-types";

type Props = {
  competitionId: string;
};

export function CommandCenterPanel({ competitionId }: Props) {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Delay simulation state
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");
  const [delayMinutes, setDelayMinutes] = useState<number>(15);
  const [preview, setPreview] = useState<DelayImpactPreview | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [applying, setApplying] = useState(false);

  // Add official state
  const [officialEmail, setOfficialEmail] = useState("");
  const [officialRole, setOfficialRole] = useState<"SCOREKEEPER" | "REFEREE">("SCOREKEEPER");
  const [addingOfficial, setAddingOfficial] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api<CommandCenterData>(`/competitions/${competitionId}/command-center`);
      setData(res);
      if (!selectedMatchId && res?.matches && res.matches.length > 0) {
        const firstActive = res.matches.find((m) => !m.isBye && m.state !== "LOCKED" && m.state !== "FINISHED");
        if (firstActive) setSelectedMatchId(firstActive.id);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load command center.");
    } finally {
      setLoading(false);
    }
  }, [competitionId, selectedMatchId]);

  useEffect(() => {
    void loadData();
    const interval = setInterval(() => void loadData(), 15000); // Live poll every 15s
    return () => clearInterval(interval);
  }, [loadData]);

  const handlePreviewDelay = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedMatchId) return;
    setSimulating(true);
    setError(null);
    try {
      const res = await api<DelayImpactPreview>(`/competitions/${competitionId}/delay-impact`, {
        method: "POST",
        body: { matchId: selectedMatchId, delayMinutes },
      });
      setPreview(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to simulate delay.");
    } finally {
      setSimulating(false);
    }
  };

  const handleApplyDelay = async () => {
    if (!preview || !selectedMatchId) return;
    if (!window.confirm(`Apply a +${preview.delayMinutes} min delay to ${preview.affectedCount} downstream match(es)?`)) return;
    setApplying(true);
    setError(null);
    try {
      await api(`/competitions/${competitionId}/apply-delay`, {
        method: "POST",
        body: { matchId: selectedMatchId, delayMinutes: preview.delayMinutes },
      });
      setNote(`Successfully applied +${preview.delayMinutes}m delay across ${preview.affectedCount} match(es).`);
      setPreview(null);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to apply delay.");
    } finally {
      setApplying(false);
    }
  };

  const handleAddOfficial = async (e: FormEvent) => {
    e.preventDefault();
    if (!officialEmail) return;
    setAddingOfficial(true);
    setError(null);
    try {
      await api(`/competitions/${competitionId}/officials`, {
        method: "POST",
        body: { email: officialEmail.trim(), role: officialRole },
      });
      setNote(`Official ${officialEmail} assigned as ${officialRole}.`);
      setOfficialEmail("");
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to assign official.");
    } finally {
      setAddingOfficial(false);
    }
  };

  if (loading && !data) return <p>Loading tournament command center…</p>;
  if (error && !data) return <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>;

  const summary = data?.summary ?? {
    totalMatches: 0,
    scheduled: 0,
    live: 0,
    finished: 0,
    delayed: 0,
    unresolved: 0,
    officialsCount: 0,
  };
  const matches = data?.matches ?? [];
  const officials = data?.officials ?? [];
  const delayedMatches = matches.filter((m) => m?.alerts?.delayed);
  const unresolvedMatches = matches.filter((m) => m?.alerts?.unresolved);

  return (
    <div style={{ display: "grid", gap: 24 }} aria-label="Organizer Command Center">
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
      {note && <p role="status" style={{ color: "#4ade80" }}>{note}</p>}

      {/* 1. Summary Cards */}
      <section aria-label="Operations Summary" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12 }}>
        <div style={{ background: "var(--surface, #141418)", padding: "12px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--muted, #888)" }}>Total Matches</div>
          <div style={{ fontSize: "1.4rem", fontWeight: "bold" }}>{summary.totalMatches}</div>
        </div>
        <div style={{ background: "var(--surface, #141418)", padding: "12px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--muted, #888)" }}>Live Now</div>
          <div style={{ fontSize: "1.4rem", fontWeight: "bold", color: summary.live > 0 ? "#f97316" : "inherit" }}>{summary.live}</div>
        </div>
        <div style={{ background: "var(--surface, #141418)", padding: "12px 14px", borderRadius: 8, border: summary.delayed > 0 ? "1px solid #ef4444" : "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: "0.75rem", color: summary.delayed > 0 ? "#ef4444" : "var(--muted, #888)" }}>Delayed</div>
          <div style={{ fontSize: "1.4rem", fontWeight: "bold", color: summary.delayed > 0 ? "#ef4444" : "inherit" }}>{summary.delayed}</div>
        </div>
        <div style={{ background: "var(--surface, #141418)", padding: "12px 14px", borderRadius: 8, border: summary.unresolved > 0 ? "1px solid #f59e0b" : "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: "0.75rem", color: summary.unresolved > 0 ? "#f59e0b" : "var(--muted, #888)" }}>Needs Review</div>
          <div style={{ fontSize: "1.4rem", fontWeight: "bold", color: summary.unresolved > 0 ? "#f59e0b" : "inherit" }}>{summary.unresolved}</div>
        </div>
        <div style={{ background: "var(--surface, #141418)", padding: "12px 14px", borderRadius: 8, border: summary.officialsCount === 0 ? "1px solid #ef4444" : "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: "0.75rem", color: summary.officialsCount === 0 ? "#ef4444" : "var(--muted, #888)" }}>Officials</div>
          <div style={{ fontSize: "1.4rem", fontWeight: "bold" }}>{summary.officialsCount}</div>
        </div>
      </section>

      {/* 2. Operations Alerts */}
      {(delayedMatches.length > 0 || summary.officialsCount === 0 || unresolvedMatches.length > 0) && (
        <section aria-label="Operations Alerts" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Active Alerts</h3>
          {summary.officialsCount === 0 && (
            <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid #ef4444", borderRadius: 8, padding: 12, fontSize: "0.9rem" }}>
              ⚠️ <strong>No scorekeepers assigned:</strong> Matches cannot be scored live until at least one official is added.
            </div>
          )}
          {delayedMatches.map((m) => (
            <div key={m.id} style={{ background: "rgba(249, 115, 22, 0.1)", border: "1px solid #f97316", borderRadius: 8, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>Delayed Match:</strong> {m.homeName} vs {m.awayName} (Round {m.round})
                <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Scheduled for {m.scheduledAt ? new Date(m.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "unscheduled"}</div>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setSelectedMatchId(m.id);
                  setDelayMinutes(15);
                  void handlePreviewDelay();
                }}
              >
                Simulate delay
              </button>
            </div>
          ))}
        </section>
      )}

      {/* 3. Delay Impact Simulator */}
      <section aria-label="Delay Impact Simulator" style={{ background: "var(--surface, #141418)", padding: 16, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)" }}>
        <h3 style={{ marginTop: 0 }}>Schedule Delay Simulator</h3>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
          Simulate how a court or match delay shifts downstream match start times across the tournament schedule before committing changes.
        </p>

        <form onSubmit={handlePreviewDelay} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <label style={{ display: "grid", gap: 4, flex: "1 1 200px" }}>
            <span style={{ fontSize: "0.85rem" }}>Target Match</span>
            <select
              value={selectedMatchId}
              onChange={(e) => {
                setSelectedMatchId(e.target.value);
                setPreview(null);
              }}
              required
              aria-label="Target match for delay"
            >
              <option value="">Select a match…</option>
              {matches.filter((m) => !m.isBye && m.state !== "FINISHED" && m.state !== "LOCKED").map((m) => (
                <option key={m.id} value={m.id}>
                  R{m.round} · {m.homeName} vs {m.awayName} ({m.scheduledAt ? new Date(m.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "unscheduled"})
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 4, width: 120 }}>
            <span style={{ fontSize: "0.85rem" }}>Delay (minutes)</span>
            <select
              value={delayMinutes}
              onChange={(e) => {
                setDelayMinutes(Number(e.target.value));
                setPreview(null);
              }}
              aria-label="Delay amount in minutes"
            >
              <option value={10}>+10 min</option>
              <option value={15}>+15 min</option>
              <option value={20}>+20 min</option>
              <option value={30}>+30 min</option>
              <option value={45}>+45 min</option>
              <option value={60}>+60 min</option>
            </select>
          </label>

          <button type="submit" disabled={simulating || !selectedMatchId}>
            {simulating ? "Calculating…" : "Preview impact"}
          </button>
        </form>

        {preview && (
          <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <strong>Delay Impact: +{preview.delayMinutes} minutes</strong>
                <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{preview.affectedCount} downstream match(es) will be pushed back.</div>
              </div>
              <button
                type="button"
                disabled={applying}
                onClick={() => void handleApplyDelay()}
                style={{ background: "#f97316", color: "#000", fontWeight: "bold" }}
              >
                {applying ? "Applying…" : "Apply delay to schedule"}
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                    <th style={{ padding: "6px 8px" }}>Round</th>
                    <th style={{ padding: "6px 8px" }}>Match</th>
                    <th style={{ padding: "6px 8px" }}>Current Time</th>
                    <th style={{ padding: "6px 8px" }}>Proposed Time</th>
                    <th style={{ padding: "6px 8px" }}>Shift</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.simulations.map((sim) => (
                    <tr key={sim.matchId} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "6px 8px" }}>R{sim.round}</td>
                      <td style={{ padding: "6px 8px" }}><strong>{sim.homeName}</strong> vs <strong>{sim.awayName}</strong></td>
                      <td style={{ padding: "6px 8px", color: "var(--muted)" }}>
                        {sim.currentScheduledAt ? new Date(sim.currentScheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "unscheduled"}
                      </td>
                      <td style={{ padding: "6px 8px", color: "#f97316", fontWeight: "bold" }}>
                        {new Date(sim.proposedScheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={{ padding: "6px 8px" }}>+{sim.delayMinutes}m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* 4. Assigned Officials */}
      <section aria-label="Assigned Officials" style={{ background: "var(--surface, #141418)", padding: 16, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)" }}>
        <h3 style={{ marginTop: 0 }}>Competition Officials ({officials.length})</h3>
        {officials.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No officials assigned yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8, marginBottom: 16 }}>
            {officials.map((off) => (
              <li key={off.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.03)", padding: "8px 12px", borderRadius: 6 }}>
                <div>
                  <strong>{off.displayName}</strong> ({off.email})
                </div>
                <span style={{ fontSize: "0.75rem", background: "rgba(255,255,255,0.1)", padding: "2px 8px", borderRadius: 4 }}>
                  {off.role}
                </span>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAddOfficial} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="email"
            placeholder="Official's email"
            value={officialEmail}
            onChange={(e) => setOfficialEmail(e.target.value)}
            required
            aria-label="Official email to assign"
            style={{ flex: "1 1 200px" }}
          />
          <select
            value={officialRole}
            onChange={(e) => setOfficialRole(e.target.value as "SCOREKEEPER" | "REFEREE")}
            aria-label="Official role"
          >
            <option value="SCOREKEEPER">Scorekeeper</option>
            <option value="REFEREE">Referee</option>
          </select>
          <button type="submit" disabled={addingOfficial}>
            {addingOfficial ? "Assigning…" : "Assign official"}
          </button>
        </form>
      </section>

      {/* 5. Complete Timetable */}
      <section aria-label="Tournament Timetable">
        <h3>Match Schedule Timetable</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {matches.map((m) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "var(--surface, #141418)",
                padding: "10px 14px",
                borderRadius: 8,
                border: m.alerts.delayed ? "1px solid #ef4444" : "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div>
                <span style={{ color: "var(--muted)", marginRight: 8 }}>R{m.round}.{m.slot}</span>
                <strong>{m.homeName}</strong> {m.homeScore ?? "–"} : {m.awayScore ?? "–"} <strong>{m.awayName}</strong>
                {m.alerts.delayed && <span style={{ color: "#ef4444", fontSize: "0.75rem", marginLeft: 8 }}>[DELAYED]</span>}
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                  {m.scheduledAt ? new Date(m.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Unscheduled"}
                </span>
                {!m.isBye && m.homeTeamId && m.awayTeamId && (
                  <Link href={`/score/${m.id}`} style={{ fontSize: "0.85rem", color: "var(--accent, #f97316)" }}>
                    Open scorer
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

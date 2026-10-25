"use client";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./api";
import { phaseLabel, when, type GameDetail } from "./game-types";
import { HostReliabilityBadge, PostRunReviewModal } from "./host-reliability-badge";
import { PickupScoutModal } from "./recruitment-invites-panel";

interface ScoutingCandidate {
  userId: string;
  displayName: string;
  checkedIn: boolean;
  invite: {
    id: string;
    teamId: string;
    teamName: string;
    inviteType: string;
    status: string;
    expiresAt: string;
  } | null;
}

interface ScoutingRosterResponse {
  gameId: string;
  gameTitle: string;
  coachTeams: Array<{ id: string; name: string }>;
  candidates: ScoutingCandidate[];
}

export function GamePanel({ id }: { id: string }) {
  const [game, setGame] = useState<GameDetail | null>(null);
  const [courtName, setCourtName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [scoutingData, setScoutingData] = useState<ScoutingRosterResponse | null>(null);
  const [scoutCandidate, setScoutCandidate] = useState<{ userId: string; name: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const g = await api<GameDetail>(`/pickup/${id}`);
      setGame(g);
      setError(null);
      api<{ name: string }>(`/courts/${g.courtId}`).then((c) => setCourtName(c.name)).catch(() => undefined);
      api<ScoutingRosterResponse>(`/pickup/${id}/scouting-roster`).then((s) => {
        if (s && Array.isArray(s.coachTeams) && Array.isArray(s.candidates)) {
          setScoutingData(s);
        }
      }).catch(() => undefined);
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 404 ? "This game doesn't exist." : err.message) : "Could not reach the server.");
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function act(path: string, method = "POST") {
    setBusy(true);
    setError(null);
    try {
      await api(`/pickup/${id}${path}`, { method });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 401 ? "Log in first." : err.message) : "Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (!game) return error ? <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p> : <p>Loading…</p>;
  const open = game.phase === "OPEN" || game.phase === "FULL";
  const live = game.phase === "OPEN" || game.phase === "FULL" || game.phase === "IN_PROGRESS";
  const canReview = !game.isHost && game.myStatus === "CONFIRMED" && (game.phase === "IN_PROGRESS" || game.phase === "UNCONFIRMED" || game.phase === "COMPLETED");

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 520 }}>
      <h1 style={{ marginBottom: 0 }}>{game.title}</h1>
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ color: "var(--muted)" }}>{courtName ?? "Court"} · hosted by <strong>{game.hostName}</strong></div>
        {game.hostId && (
          <div>
            <HostReliabilityBadge hostId={game.hostId} />
          </div>
        )}
      </div>
      <div>{when(game.startsAt)} – {when(game.endsAt)}</div>
      <div role="status"><strong>{phaseLabel[game.phase]}</strong> · {game.confirmedCount}/{game.capacity} players{game.waitlistCount > 0 ? ` · ${game.waitlistCount} on waitlist` : ""} · {game.checkInCount} checked in</div>

      {game.myStatus === "CONFIRMED" && <p>You're in.</p>}
      {game.myStatus === "WAITLIST" && <p>You're on the waitlist. You'll be moved in automatically if a spot opens.</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {open && (game.myStatus === null || game.myStatus === "CANCELLED") && (
          <button disabled={busy} onClick={() => act("/rsvp")}>{game.phase === "FULL" ? "Join waitlist" : "Join game"}</button>
        )}
        {open && (game.myStatus === "CONFIRMED" || game.myStatus === "WAITLIST") && !game.isHost && (
          <button className="secondary" disabled={busy} onClick={() => act("/rsvp", "DELETE")}>Leave game</button>
        )}
        {live && game.myStatus === "CONFIRMED" && <button disabled={busy} onClick={() => act("/check-in")}>Check in</button>}
        {game.isHost && live && <button className="secondary" disabled={busy} onClick={() => act("/cancel")}>Cancel game</button>}
        {game.isHost && (game.phase === "IN_PROGRESS" || game.phase === "UNCONFIRMED") && (
          <button disabled={busy} onClick={() => act("/complete")}>Confirm it was played</button>
        )}
        {canReview && (
          <button
            type="button"
            className="secondary"
            style={{ fontWeight: 600, border: "1px solid #f97316", color: "#f97316" }}
            onClick={() => setIsReviewOpen(true)}
          >
            ★ Leave Host Review
          </button>
        )}
      </div>
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}

      {game.participants ? (
        <section aria-label="Players">
          <h2>Players</h2>
          <ul>{game.participants.map((p, i) => <li key={i}>{p.name}{p.status === "WAITLIST" ? " (waitlist)" : ""}{p.checkedIn ? " ✓ checked in" : ""}</li>)}</ul>
        </section>
      ) : <p style={{ color: "var(--muted)" }}>Join the game to see who's playing.</p>}

      {scoutingData && (scoutingData.coachTeams?.length ?? 0) > 0 && (scoutingData.candidates?.length ?? 0) > 0 && (
        <section aria-label="Coach Scouting Pathway" style={{ marginTop: 14, padding: 14, background: "rgba(255, 255, 255, 0.03)", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.1)" }}>
          <h2 style={{ fontSize: "1.1rem", margin: "0 0 6px 0", color: "#f97316" }}>Coach Scouting & Pathways</h2>
          <p style={{ margin: "0 0 10px 0", fontSize: "0.85rem", color: "var(--muted)" }}>
            Scout players from this pickup run and send direct tryout or roster recruitment invitations for:{" "}
            <strong>{scoutingData.coachTeams.map((t) => t.name).join(", ")}</strong>
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {scoutingData.candidates.map((cand) => (
              <li
                key={cand.userId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  background: "rgba(0, 0, 0, 0.2)",
                  borderRadius: 6,
                  fontSize: "0.9rem",
                }}
              >
                <div>
                  <strong>{cand.displayName}</strong>
                  {cand.checkedIn && <span style={{ color: "#22c55e", fontSize: "0.8rem", marginLeft: 6 }}>✓ checked in</span>}
                </div>
                <div>
                  {cand.invite ? (
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: 4,
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        background:
                          cand.invite.status === "ACCEPTED"
                            ? "rgba(34, 197, 94, 0.2)"
                            : cand.invite.status === "PENDING"
                            ? "rgba(245, 158, 11, 0.2)"
                            : "rgba(148, 163, 184, 0.2)",
                        color:
                          cand.invite.status === "ACCEPTED"
                            ? "#22c55e"
                            : cand.invite.status === "PENDING"
                            ? "#f59e0b"
                            : "#94a3b8",
                      }}
                    >
                      {cand.invite.status} ({cand.invite.inviteType.replace("_", " ")})
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="secondary"
                      style={{ fontSize: "0.8rem", padding: "4px 10px", borderColor: "#f97316", color: "#f97316" }}
                      onClick={() => setScoutCandidate({ userId: cand.userId, name: cand.displayName })}
                    >
                      Scout & Invite
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {scoutCandidate && (
        <PickupScoutModal
          gameId={id}
          gameTitle={game.title}
          candidateUserId={scoutCandidate.userId}
          candidateName={scoutCandidate.name}
          isOpen={Boolean(scoutCandidate)}
          onClose={() => setScoutCandidate(null)}
          onSuccess={() => void load()}
        />
      )}

      {game.hostId && (
        <PostRunReviewModal
          gameId={game.id}
          gameTitle={game.title}
          hostName={game.hostName ?? "Host"}
          isOpen={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
        />
      )}
    </div>
  );
}

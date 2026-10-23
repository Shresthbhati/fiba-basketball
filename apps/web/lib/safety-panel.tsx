"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, api, type Me } from "./api";

type Consents = Record<string, boolean>;
type Guardianships = {
  guardians: { id: string; guardianEmail: string; status: "PENDING" | "ACTIVE" }[];
  wards: { id: string; minorId: string; minorName: string }[];
  invitations: { id: string; minorName: string }[];
};
type Block = { userId: string; displayName: string; kind: "BLOCK" | "MUTE" };

const CONSENT_LABEL: Record<string, string> = {
  PUBLIC_PICKUP: "Join public pickup games",
  PROFILE_DISCOVERY: "Appear in player discovery",
  MEDIA_USE: "Use photos and video of them",
  COMPETITION_PLAY: "Play in organised competitions",
};

function ConsentList({ consents, onToggle, canGrant }: { consents: Consents; onToggle: (kind: string, on: boolean) => void; canGrant: boolean }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
      {Object.entries(CONSENT_LABEL).map(([kind, label]) => {
        const on = consents[kind] === true;
        return (
          <li key={kind} style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ flex: 1 }}>{label}: <strong>{on ? "allowed" : "not allowed"}</strong></span>
            {(canGrant || on) && (
              <button className="secondary" onClick={() => onToggle(kind, !on)} aria-label={`${on ? "Withdraw" : "Allow"}: ${label}`}>
                {on ? "Withdraw" : "Allow"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function SafetyPanel() {
  const [me, setMe] = useState<Me | null>(null);
  const [consents, setConsents] = useState<Consents>({});
  const [family, setFamily] = useState<Guardianships | null>(null);
  const [wardConsents, setWardConsents] = useState<Record<string, Consents>>({});
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, c, f, b] = await Promise.all([
        api<Me>("/me"), api<Consents>("/consents"), api<Guardianships>("/guardians"), api<{ items: Block[] }>("/blocks"),
      ]);
      setMe(m); setConsents(c); setFamily(f); setBlocks(b.items);
      const entries = await Promise.all(f.wards.map(async (w) => [w.minorId, await api<Consents>(`/consents?subjectId=${w.minorId}`)] as const));
      setWardConsents(Object.fromEntries(entries));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 401 ? "Log in to manage safety and family settings." : err.message) : "Could not reach the server.");
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Could not reach the server."); }
  }

  const setConsent = (kind: string, on: boolean, subjectId?: string) =>
    run(() => api(`/consents/${kind}${on ? "" : subjectId ? `?subjectId=${subjectId}` : ""}`, {
      method: on ? "PUT" : "DELETE", ...(on && subjectId ? { body: { subjectId } } : {}),
    }));
  const invite = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const guardianEmail = String(new FormData(form).get("guardianEmail") ?? "").trim();
    void run(async () => { await api("/guardians", { method: "POST", body: { guardianEmail } }); form.reset(); });
  };

  if (!loaded) return <p>Loading…</p>;
  if (!me) return <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>;
  return (
    <>
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}

      <section>
        <h2>Your permissions</h2>
        {me.isMinor && <p style={{ color: "var(--muted)" }}>You are under 18, so a guardian decides these. You can withdraw any of them.</p>}
        <ConsentList consents={consents} canGrant={!me.isMinor} onToggle={(k, on) => void setConsent(k, on)} />
      </section>

      {me.isMinor && (
        <section>
          <h2>Your guardians</h2>
          {family!.guardians.length === 0 && <p>No guardian yet. Invite a parent or guardian by email; they accept from their own account.</p>}
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {family!.guardians.map((g) => (
              <li key={g.id} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ flex: 1 }}>{g.guardianEmail} · {g.status === "ACTIVE" ? "confirmed" : "waiting for them to accept"}</span>
                <button className="secondary" onClick={() => void run(() => api(`/guardians/${g.id}`, { method: "DELETE" }))}
                  aria-label={`Remove guardian ${g.guardianEmail}`}>Remove</button>
              </li>
            ))}
          </ul>
          <form onSubmit={invite} style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1 }}>Guardian email
              <input name="guardianEmail" type="email" required />
            </label>
            <button type="submit">Invite</button>
          </form>
        </section>
      )}

      {family!.invitations.length > 0 && (
        <section>
          <h2>Guardian requests</h2>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {family!.invitations.map((i) => (
              <li key={i.id} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ flex: 1 }}>{i.minorName} asked you to be their guardian.</span>
                <button onClick={() => void run(() => api(`/guardians/${i.id}/accept`, { method: "POST" }))}>Accept</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {family!.wards.map((w) => (
        <section key={w.id}>
          <h2>Permissions for {w.minorName}</h2>
          <ConsentList consents={wardConsents[w.minorId] ?? {}} canGrant onToggle={(k, on) => void setConsent(k, on, w.minorId)} />
          <button className="secondary" onClick={() => void run(() => api(`/guardians/${w.id}`, { method: "DELETE" }))}>Stop being their guardian</button>
        </section>
      ))}

      <section>
        <h2>Blocked and muted</h2>
        {blocks.length === 0 && <p>You haven&apos;t blocked or muted anyone.</p>}
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
          {blocks.map((b) => (
            <li key={b.userId} style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ flex: 1 }}>{b.displayName} · {b.kind === "BLOCK" ? "blocked" : "muted"}</span>
              <button className="secondary" onClick={() => void run(() => api(`/blocks/${b.userId}`, { method: "DELETE" }))}
                aria-label={`Unblock ${b.displayName}`}>Undo</button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, api } from "../../lib/api";
import { formatLabel, statusLabel, type CompetitionSummary } from "../../lib/competition-types";

export default function Competitions() {
  const [items, setItems] = useState<CompetitionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ items: CompetitionSummary[] }>("/competitions").then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not reach the server."));
  }, []);
  return (
    <main>
      <h1>Competitions</h1>
      <p><Link href="/competitions/new">Create a competition</Link></p>
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
      {!items && !error && <p>Loading…</p>}
      {items && items.length === 0 && <p>No competitions yet. Create the first one.</p>}
      {items && items.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
          {items.map((c) => (
            <li key={c.id} style={{ background: "var(--surface)", padding: 12, borderRadius: 8 }}>
              <Link href={`/competitions/${c.id}`}><strong>{c.name}</strong></Link>{c.mine ? " (yours)" : ""}
              <div style={{ color: "var(--muted)" }}>{formatLabel[c.format]} · {statusLabel[c.status]}</div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

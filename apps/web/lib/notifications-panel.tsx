"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "./api";
import { when } from "./game-types";

export type Notice = { id: string; kind: string; title: string; link: string | null; data: Record<string, string> | null; createdAt: string; read: boolean };
export type Inbox = { items: Notice[]; unread: number };

export const inboxQuery = { queryKey: ["notifications"], queryFn: () => api<Inbox>("/notifications"), refetchInterval: 60_000, retry: false } as const;

function EmailSetting() {
  const settings = useQuery({ queryKey: ["notification-settings"], queryFn: () => api<{ email: boolean; emailAvailable: boolean }>("/notifications/settings"), retry: false });
  const [choice, setChoice] = useState<boolean | null>(null); // what the person just picked, shown immediately
  const [error, setError] = useState<string | null>(null);
  if (!settings.data) return null;
  if (!settings.data.emailAvailable) return <p style={{ color: "var(--muted)" }}>Email notifications are not available for under-18 accounts.</p>;
  const checked = choice ?? settings.data.email;
  async function toggle(email: boolean) {
    setError(null);
    setChoice(email);
    try { await api("/notifications/settings", { method: "PUT", body: { email } }); }
    catch (e) { setChoice(null); setError(e instanceof ApiError ? e.message : "Could not reach the server."); }
  }
  return (
    <div>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" style={{ width: "auto" }} checked={checked} onChange={(e) => void toggle(e.target.checked)} />
        Email me when a game is cancelled or a spot opens up
      </label>
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
    </div>
  );
}

export function NotificationsPanel() {
  const qc = useQueryClient();
  const inbox = useQuery(inboxQuery);
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const read = async (ids?: string[]) => { await api("/notifications/read", { method: "POST", body: ids ? { ids } : {} }); await refresh(); };

  if (inbox.error instanceof ApiError && inbox.error.status === 401) return <p><Link href="/login">Log in</Link> to see your notifications.</p>;
  if (inbox.error) return <p role="alert" style={{ color: "#ff6b6b" }}>Could not load notifications.</p>;
  if (!inbox.data) return <p>Loading…</p>;
  const { items, unread } = inbox.data;
  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
      <EmailSetting />
      {unread > 0 && <button type="button" className="secondary" onClick={() => read()}>Mark all as read</button>}
      {items.length === 0 && <p>Nothing yet. You will hear about cancelled games, waitlist spots and new teams here.</p>}
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
        {items.map((n) => (
          <li key={n.id} style={{ background: "var(--surface)", padding: 12, borderRadius: 8, borderLeft: n.read ? "4px solid transparent" : "4px solid var(--accent, #4da3ff)" }}>
            {n.link ? <Link href={n.link} onClick={() => { if (!n.read) void read([n.id]); }}>{n.title}</Link> : n.title}
            {!n.read && <span className="sr-only"> (unread)</span>}
            <div style={{ color: "var(--muted)" }}>
              {n.data?.startsAt ? `Game time: ${when(n.data.startsAt)} · ` : ""}{new Date(n.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

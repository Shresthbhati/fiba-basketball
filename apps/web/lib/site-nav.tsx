"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ApiError, api, type Me } from "./api";
import { inboxQuery } from "./notifications-panel";
import { SyncIndicator } from "./sync-indicator";
import { VerifyBanner } from "./verify-banner";

export function SiteNav() {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/me").catch((e) => { if (e instanceof ApiError && e.status === 401) return null; throw e; }),
    retry: false,
  });
  const user = me.data;
  const inbox = useQuery({ ...inboxQuery, enabled: !!user });
  const unread = inbox.data?.unread ?? 0;
  return (
    <>
    {user && !user.emailVerified && <VerifyBanner />}
    <header style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <Link href="/"><strong>COURT IQ</strong></Link>
      <Link href="/courts">Courts</Link>
      <Link href="/pickup">Pickup</Link>
      <Link href="/communities">Communities</Link>
      <Link href="/train">Train</Link>
      <Link href="/competitions">Competitions</Link>
      <Link href="/teams">Teams</Link>
      <Link href="/free-agents">Free Agents</Link>
      <Link href="/film/search">Film</Link>
      <Link href="/playbook">Playbook</Link>
      <Link href="/practices">Practices</Link>
      <Link href="/assignments">Assignments</Link>
      <Link href="/coach">Coach</Link>
      <Link href="/opportunities">Opportunities</Link>
      <Link href="/scouts">Scouts</Link>
      <Link href="/train/readiness">Readiness</Link>
      {user && <Link href="/career">Record</Link>}
      <span style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
        <SyncIndicator />
        {user ? (
          <>
            <Link href="/notifications" aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}>Notifications{unread > 0 ? ` (${unread > 99 ? "99+" : unread})` : ""}</Link>
            <Link href="/safety">Safety</Link>
            <span>{user.displayName}</span>
            <button className="secondary" style={{ minHeight: 36, padding: "4px 12px" }} onClick={async () => {
              await api("/auth/logout", { method: "POST" });
              await qc.invalidateQueries({ queryKey: ["me"] });
            }}>Log out</button>
          </>
        ) : me.isSuccess ? (
          <><Link href="/login">Log in</Link><Link href="/signup">Sign up</Link></>
        ) : null}
      </span>
    </header>
    </>
  );
}

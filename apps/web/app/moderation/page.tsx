"use client";

import React, { useEffect, useState } from "react";
import { ModerationConsole, type ModerationCaseItem, type CaseDetail, type AuditLogEntry } from "../../lib/moderation-console";
import { api, ApiError } from "../../lib/api";

export default function ModerationPage() {
  const [cases, setCases] = useState<ModerationCaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCases() {
      try {
        setLoading(true);
        const data = await api<{ items: ModerationCaseItem[] }>("/moderation/cases?status=OPEN");
        setCases(data.items);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
          setError("Access restricted. This console requires verified MODERATOR role authorization (ADR-0010).");
        } else {
          setError("Unable to reach the moderation service.");
        }
      } finally {
        setLoading(false);
      }
    }
    fetchCases();
  }, []);

  const handleInspectCase = async (caseId: string, reason: string): Promise<CaseDetail> => {
    return api<CaseDetail>(`/moderation/cases/${caseId}?reason=${encodeURIComponent(reason)}`);
  };

  const handleResolveCase = async (caseId: string, outcome: "RESOLVED" | "DISMISSED", note: string): Promise<void> => {
    await api(`/moderation/cases/${caseId}/resolve`, {
      method: "POST",
      body: { outcome, note },
    });
  };

  const handleFetchAudit = async (reason: string): Promise<AuditLogEntry[]> => {
    const data = await api<{ items: AuditLogEntry[] }>(`/admin/audit?reason=${encodeURIComponent(reason)}`);
    return data.items;
  };

  if (loading) {
    return (
      <main style={{ padding: "24px" }}>
        <p style={{ color: "var(--cq-text-muted, #94a3b8)" }}>Loading moderation cases...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ padding: "24px" }}>
        <div
          role="alert"
          style={{
            background: "rgba(239, 68, 68, 0.15)",
            color: "#f87171",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            padding: "16px",
            borderRadius: "8px",
          }}
        >
          {error}
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: "24px", maxWidth: "1000px", margin: "0 auto" }}>
      <ModerationConsole
        initialCases={cases}
        onInspectCase={handleInspectCase}
        onResolveCase={handleResolveCase}
        onFetchAudit={handleFetchAudit}
      />
    </main>
  );
}

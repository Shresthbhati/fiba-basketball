"use client";

import React, { useState } from "react";

export interface ModerationCaseItem {
  id: string;
  targetType: "USER" | "PICKUP_GAME" | "COURT";
  targetId: string;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  reportCount: number;
  createdAt: string;
}

export interface CaseDetail extends ModerationCaseItem {
  reports: Array<{
    reporterId: string;
    reason: string;
    note: string | null;
    createdAt: string;
  }>;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  action: string;
  reason: string;
  createdAt: string;
}

export interface ModerationConsoleProps {
  initialCases?: ModerationCaseItem[];
  onInspectCase?: (caseId: string, reason: string) => Promise<CaseDetail>;
  onResolveCase?: (caseId: string, outcome: "RESOLVED" | "DISMISSED", note: string) => Promise<void>;
  onFetchAudit?: (reason: string) => Promise<AuditLogEntry[]>;
}

export function ModerationConsole({
  initialCases = [],
  onInspectCase,
  onResolveCase,
  onFetchAudit,
}: ModerationConsoleProps) {
  const [activeTab, setActiveTab] = useState<"queue" | "audit">("queue");
  const [statusFilter, setStatusFilter] = useState<"OPEN" | "RESOLVED" | "DISMISSED">("OPEN");
  const [cases, setCases] = useState<ModerationCaseItem[]>(initialCases);

  // Inspection modal state
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [inspectReason, setInspectReason] = useState("");
  const [activeCaseDetail, setActiveCaseDetail] = useState<CaseDetail | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

  // Resolution modal state
  const [resolveOutcome, setResolveOutcome] = useState<"RESOLVED" | "DISMISSED">("RESOLVED");
  const [resolveNote, setResolveNote] = useState("");
  const [isResolving, setIsResolving] = useState(false);

  // Audit trail state
  const [auditReason, setAuditReason] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  const filteredCases = cases.filter((c) => c.status === statusFilter);

  const handleStartInspect = (caseId: string) => {
    setSelectedCaseId(caseId);
    setInspectReason("");
    setActiveCaseDetail(null);
    setInspectError(null);
  };

  const handleConfirmInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inspectReason.trim().length < 8) {
      setInspectError("A sensitive read must provide an audited justification (minimum 8 characters).");
      return;
    }
    if (!selectedCaseId || !onInspectCase) return;

    try {
      setIsInspecting(true);
      setInspectError(null);
      const detail = await onInspectCase(selectedCaseId, inspectReason.trim());
      setActiveCaseDetail(detail);
    } catch (err: unknown) {
      setInspectError(err instanceof Error ? err.message : "Failed to load case details.");
    } finally {
      setIsInspecting(false);
    }
  };

  const handleExecuteResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resolveNote.trim().length < 3 || !selectedCaseId || !onResolveCase) return;

    try {
      setIsResolving(true);
      await onResolveCase(selectedCaseId, resolveOutcome, resolveNote.trim());
      // Update case status in state
      setCases((prev) =>
        prev.map((c) => (c.id === selectedCaseId ? { ...c, status: resolveOutcome } : c))
      );
      setSelectedCaseId(null);
      setActiveCaseDetail(null);
      setResolveNote("");
    } catch (err: unknown) {
      setInspectError(err instanceof Error ? err.message : "Failed to resolve case.");
    } finally {
      setIsResolving(false);
    }
  };

  const handleLoadAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (auditReason.trim().length < 8 || !onFetchAudit) return;

    try {
      setIsLoadingAudit(true);
      const logs = await onFetchAudit(auditReason.trim());
      setAuditLogs(logs);
    } catch {
      // Ignored
    } finally {
      setIsLoadingAudit(false);
    }
  };

  return (
    <div
      style={{
        background: "var(--cq-surface, #1e293b)",
        color: "var(--cq-text, #f8fafc)",
        borderRadius: "12px",
        padding: "24px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          paddingBottom: "16px",
          marginBottom: "20px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
              🛡️ Trust & Safety Moderation Console
            </h1>
            <span
              style={{
                fontSize: "12px",
                padding: "2px 8px",
                borderRadius: "4px",
                background: "rgba(239, 68, 68, 0.15)",
                color: "#f87171",
                fontWeight: 600,
              }}
            >
              Moderator Authorized
            </span>
          </div>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#94a3b8" }}>
            Investigate community reports, take moderation action, and audit sensitive admin reads (Spec §15.2, §23).
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", background: "#0f172a", borderRadius: "6px", padding: "2px" }}>
          <button
            type="button"
            onClick={() => setActiveTab("queue")}
            style={{
              padding: "6px 14px",
              borderRadius: "4px",
              background: activeTab === "queue" ? "#334155" : "transparent",
              color: "#f8fafc",
              border: "none",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cases Queue ({cases.filter((c) => c.status === "OPEN").length} Open)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("audit")}
            style={{
              padding: "6px 14px",
              borderRadius: "4px",
              background: activeTab === "audit" ? "#334155" : "transparent",
              color: "#f8fafc",
              border: "none",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Admin Audit Trail
          </button>
        </div>
      </div>

      {activeTab === "queue" ? (
        <div>
          {/* Status filter bar */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            {(["OPEN", "RESOLVED", "DISMISSED"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  background: statusFilter === st ? "rgba(59, 130, 246, 0.2)" : "transparent",
                  color: statusFilter === st ? "#60a5fa" : "#94a3b8",
                  border: statusFilter === st ? "1px solid #3b82f6" : "1px solid rgba(255, 255, 255, 0.1)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Cases table / cards */}
          {filteredCases.length === 0 ? (
            <div
              style={{
                padding: "36px",
                textAlign: "center",
                background: "#0f172a",
                borderRadius: "8px",
                color: "#94a3b8",
                fontSize: "13px",
              }}
            >
              No moderation cases currently with status <strong>{statusFilter}</strong>.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {filteredCases.map((c) => (
                <div
                  key={c.id}
                  style={{
                    background: "#0f172a",
                    padding: "16px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: c.targetType === "USER" ? "rgba(168, 85, 247, 0.2)" : "rgba(14, 165, 233, 0.2)",
                          color: c.targetType === "USER" ? "#c084fc" : "#38bdf8",
                        }}
                      >
                        Target: {c.targetType}
                      </span>
                      <strong style={{ fontSize: "13px", color: "#f8fafc" }}>
                        Case #{c.id.slice(0, 8)}
                      </strong>
                    </div>
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                      Reports Filed: <strong style={{ color: "#f87171" }}>{c.reportCount}</strong> • Created on {new Date(c.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => handleStartInspect(c.id)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "6px",
                        background: "#334155",
                        color: "#f8fafc",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      🔍 Inspect & Action
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Audit log view */
        <div>
          <form onSubmit={handleLoadAudit} style={{ display: "flex", gap: "10px", marginBottom: "20px", alignItems: "center" }}>
            <input
              type="text"
              placeholder="State audited reason for accessing logs (min 8 chars)..."
              value={auditReason}
              onChange={(e) => setAuditReason(e.target.value)}
              aria-label="Audit Access Reason"
              style={{
                flex: 1,
                padding: "8px 12px",
                background: "#0f172a",
                color: "#f8fafc",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "6px",
                fontSize: "13px",
              }}
            />
            <button
              type="submit"
              disabled={auditReason.trim().length < 8 || isLoadingAudit}
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                background: "#2563eb",
                color: "#ffffff",
                border: "none",
                fontSize: "13px",
                fontWeight: 600,
                cursor: auditReason.trim().length < 8 ? "not-allowed" : "pointer",
                opacity: auditReason.trim().length < 8 ? 0.6 : 1,
              }}
            >
              {isLoadingAudit ? "Reading..." : "📜 Fetch Audit Trail"}
            </button>
          </form>

          {auditLogs.length > 0 && (
            <div style={{ display: "grid", gap: "8px" }}>
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  style={{
                    background: "#0f172a",
                    padding: "12px 16px",
                    borderRadius: "6px",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    fontSize: "12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <strong style={{ color: "#38bdf8" }}>{log.action}</strong>
                    <span style={{ color: "#64748b" }}>{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                  <div style={{ color: "#94a3b8" }}>
                    Reason: <em style={{ color: "#cbd5e1" }}>&ldquo;{log.reason}&rdquo;</em> • Actor: {log.actorId.slice(0, 8)}...
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Case inspection & resolution modal */}
      {selectedCaseId && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px",
          }}
        >
          <div
            style={{
              background: "#1e293b",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "600px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              border: "1px solid rgba(255, 255, 255, 0.15)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>
                Case Inspection: #{selectedCaseId.slice(0, 8)}
              </h2>
              <button
                type="button"
                onClick={() => setSelectedCaseId(null)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "18px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {!activeCaseDetail ? (
              /* Audited Reason Entry Form */
              <form onSubmit={handleConfirmInspect}>
                <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 12px 0" }}>
                  To inspect reporter identities and unredacted report notes, enter your official investigation justification.
                  This read is written to the immutable audit trail (Spec §15.2).
                </p>
                <div style={{ marginBottom: "14px" }}>
                  <label htmlFor="inspectReasonInput" style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                    Audit Justification Reason (min 8 characters):
                  </label>
                  <input
                    id="inspectReasonInput"
                    type="text"
                    value={inspectReason}
                    onChange={(e) => setInspectReason(e.target.value)}
                    placeholder="e.g. Investigating reported harassment incident"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "#0f172a",
                      color: "#f8fafc",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                      borderRadius: "6px",
                      fontSize: "13px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {inspectError && (
                  <p role="alert" style={{ color: "#f87171", fontSize: "12px", marginBottom: "12px" }}>
                    {inspectError}
                  </p>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setSelectedCaseId(null)}
                    style={{ padding: "8px 14px", borderRadius: "6px", background: "#334155", color: "#f8fafc", border: "none", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isInspecting || inspectReason.trim().length < 8}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      background: "#2563eb",
                      color: "#ffffff",
                      border: "none",
                      fontWeight: 600,
                      cursor: inspectReason.trim().length < 8 ? "not-allowed" : "pointer",
                      opacity: inspectReason.trim().length < 8 ? 0.6 : 1,
                    }}
                  >
                    {isInspecting ? "Authorizing..." : "Authorize & View Reports"}
                  </button>
                </div>
              </form>
            ) : (
              /* Case Reports and Resolution Actions */
              <div>
                <div style={{ background: "#0f172a", padding: "12px", borderRadius: "8px", marginBottom: "16px" }}>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>Target Resource ID:</span>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#38bdf8" }}>{activeCaseDetail.targetId}</div>
                </div>

                <h3 style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 8px 0" }}>
                  Community Reports ({activeCaseDetail.reports.length})
                </h3>
                <div style={{ display: "grid", gap: "8px", marginBottom: "20px", maxHeight: "180px", overflowY: "auto" }}>
                  {activeCaseDetail.reports.map((r, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: "#0f172a",
                        padding: "10px",
                        borderRadius: "6px",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        fontSize: "12px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontWeight: 700, color: "#f87171" }}>{r.reason}</span>
                        <span style={{ color: "#64748b" }}>{new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                      {r.note && <div style={{ color: "#cbd5e1" }}>&ldquo;{r.note}&rdquo;</div>}
                    </div>
                  ))}
                </div>

                {activeCaseDetail.status === "OPEN" ? (
                  <form onSubmit={handleExecuteResolution} style={{ borderTop: "1px solid rgba(255, 255, 255, 0.1)", paddingTop: "16px" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 10px 0" }}>
                      Take Moderation Action
                    </h3>
                    <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
                        <input
                          type="radio"
                          name="resolutionOutcome"
                          checked={resolveOutcome === "RESOLVED"}
                          onChange={() => setResolveOutcome("RESOLVED")}
                        />
                        Resolve & Enforce Sanction
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
                        <input
                          type="radio"
                          name="resolutionOutcome"
                          checked={resolveOutcome === "DISMISSED"}
                          onChange={() => setResolveOutcome("DISMISSED")}
                        />
                        Dismiss Case (No Violation)
                      </label>
                    </div>

                    <div style={{ marginBottom: "14px" }}>
                      <label htmlFor="resolveNoteInput" style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                        Resolution Audit Note:
                      </label>
                      <textarea
                        id="resolveNoteInput"
                        rows={3}
                        value={resolveNote}
                        onChange={(e) => setResolveNote(e.target.value)}
                        placeholder="Explain resolution findings and actions taken..."
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          background: "#0f172a",
                          color: "#f8fafc",
                          border: "1px solid rgba(255, 255, 255, 0.2)",
                          borderRadius: "6px",
                          fontSize: "13px",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() => setSelectedCaseId(null)}
                        style={{ padding: "8px 14px", borderRadius: "6px", background: "#334155", color: "#f8fafc", border: "none", cursor: "pointer" }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isResolving || resolveNote.trim().length < 3}
                        style={{
                          padding: "8px 16px",
                          borderRadius: "6px",
                          background: resolveOutcome === "RESOLVED" ? "#10b981" : "#64748b",
                          color: "#ffffff",
                          border: "none",
                          fontWeight: 600,
                          cursor: resolveNote.trim().length < 3 ? "not-allowed" : "pointer",
                          opacity: resolveNote.trim().length < 3 ? 0.6 : 1,
                        }}
                      >
                        {isResolving ? "Submitting..." : `Confirm ${resolveOutcome}`}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.1)", paddingTop: "12px", fontSize: "13px", color: "#34d399" }}>
                    ✓ This case has already been <strong>{activeCaseDetail.status}</strong>.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

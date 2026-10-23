"use client";

import React, { useState } from "react";
import Link from "next/link";

export type DrillCategory = "WARMUP" | "TECHNICAL" | "TACTICAL" | "SCRIMMAGE" | "COOLDOWN";
export type DrillIntensity = "LOW" | "MEDIUM" | "HIGH";
export type PracticeStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type AttendanceStatus = "PRESENT" | "ABSENT" | "EXCUSED" | "INJURED";

export interface PracticeBlock {
  id: string;
  order: number;
  drillId?: string | undefined;
  title: string;
  category: DrillCategory;
  durationMins: number;
  notes?: string | undefined;
  playId?: string | undefined;
  clipId?: string | undefined;
}

export interface AttendanceRecord {
  userId: string;
  name?: string;
  status: AttendanceStatus;
  note?: string | undefined;
}

export interface PracticeSession {
  id: string;
  teamId: string;
  title: string;
  scheduledAt: string;
  location?: string | null;
  focus?: string | null;
  notes?: string | null;
  blocks: PracticeBlock[];
  totalDurationMins: number;
  attendance: AttendanceRecord[];
  status: PracticeStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DrillItem {
  id: string;
  teamId?: string | null;
  title: string;
  category: DrillCategory;
  intensity: DrillIntensity;
  suggestedDurationMins: number;
  brief?: string | null;
  playId?: string | null;
  tags: string[];
}

export const CATEGORY_THEMES: Record<DrillCategory, { label: string; color: string; bg: string; border: string }> = {
  WARMUP: { label: "Warmup & Activation", color: "#065f46", bg: "#ecfdf5", border: "#a7f3d0" },
  TECHNICAL: { label: "Technical Skills", color: "#0369a1", bg: "#f0f9ff", border: "#bae6fd" },
  TACTICAL: { label: "Tactical Installation", color: "#5b21b6", bg: "#f5f3ff", border: "#ddd6fe" },
  SCRIMMAGE: { label: "Live Scrimmage", color: "#92400e", bg: "#fffbeb", border: "#fde68a" },
  COOLDOWN: { label: "Cooldown & Recovery", color: "#115e59", bg: "#f0fdfa", border: "#99f6e4" },
};

export const ATTENDANCE_THEMES: Record<AttendanceStatus, { label: string; color: string; bg: string }> = {
  PRESENT: { label: "Present", color: "#166534", bg: "#dcfce7" },
  ABSENT: { label: "Absent", color: "#991b1b", bg: "#fee2e2" },
  EXCUSED: { label: "Excused", color: "#854d0e", bg: "#fef9c3" },
  INJURED: { label: "Injured (Rehab)", color: "#1e40af", bg: "#dbeafe" },
};

export interface PracticePlannerProps {
  practice: PracticeSession;
  drillsCatalog?: DrillItem[];
  onSave?: (updated: PracticeSession) => Promise<void>;
  onAttendanceUpdate?: (attendance: AttendanceRecord[]) => Promise<void>;
  readOnly?: boolean;
}

export const PracticePlanner: React.FC<PracticePlannerProps> = ({
  practice: initialPractice,
  drillsCatalog = [],
  onSave,
  onAttendanceUpdate,
  readOnly = false,
}) => {
  const [practice, setPractice] = useState<PracticeSession>(initialPractice);
  const [activeTab, setActiveTab] = useState<"timeline" | "drills" | "attendance">("timeline");
  const [showDrillModal, setShowDrillModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Recalculate duration dynamically
  const calculatedDuration = practice.blocks.reduce((sum, b) => sum + (b.durationMins || 0), 0);

  // Category breakdown calculation
  const breakdown = practice.blocks.reduce((acc, b) => {
    acc[b.category] = (acc[b.category] || 0) + b.durationMins;
    return acc;
  }, {} as Record<DrillCategory, number>);

  const handleBlockChange = (index: number, updates: Partial<PracticeBlock>) => {
    const newBlocks = [...practice.blocks];
    newBlocks[index] = { ...newBlocks[index]!, ...updates };
    setPractice({
      ...practice,
      blocks: newBlocks,
      totalDurationMins: newBlocks.reduce((sum, b) => sum + (b.durationMins || 0), 0),
    });
  };

  const handleRemoveBlock = (index: number) => {
    const newBlocks = practice.blocks.filter((_, i) => i !== index).map((b, i) => ({ ...b, order: i + 1 }));
    setPractice({
      ...practice,
      blocks: newBlocks,
      totalDurationMins: newBlocks.reduce((sum, b) => sum + (b.durationMins || 0), 0),
    });
  };

  const handleAddDrillToPractice = (drill: DrillItem) => {
    const newBlock: PracticeBlock = {
      id: `block-${Date.now()}-${practice.blocks.length + 1}`,
      order: practice.blocks.length + 1,
      drillId: drill.id,
      title: drill.title,
      category: drill.category,
      durationMins: drill.suggestedDurationMins || 10,
      notes: drill.brief || undefined,
      playId: drill.playId || undefined,
    };
    const newBlocks = [...practice.blocks, newBlock];
    setPractice({
      ...practice,
      blocks: newBlocks,
      totalDurationMins: newBlocks.reduce((sum, b) => sum + (b.durationMins || 0), 0),
    });
    setShowDrillModal(false);
  };

  const handleAttendanceChange = async (userId: string, status: AttendanceStatus) => {
    const updatedAttendance = practice.attendance.map((a) =>
      a.userId === userId ? { ...a, status } : a
    );
    if (!practice.attendance.some((a) => a.userId === userId)) {
      updatedAttendance.push({ userId, status });
    }
    setPractice({ ...practice, attendance: updatedAttendance });
    if (onAttendanceUpdate) {
      await onAttendanceUpdate(updatedAttendance);
    }
  };

  const handleSaveSession = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(practice);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const filteredDrills = selectedCategory === "ALL"
    ? drillsCatalog
    : drillsCatalog.filter((d) => d.category === selectedCategory);

  const presentCount = practice.attendance.filter((a) => a.status === "PRESENT").length;
  const injuredCount = practice.attendance.filter((a) => a.status === "INJURED").length;
  const absentCount = practice.attendance.filter((a) => a.status === "ABSENT").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Session Header Card */}
      <div
        style={{
          border: "1px solid var(--cq-border, #e5e7eb)",
          borderRadius: 12,
          padding: 24,
          background: "var(--cq-card-bg, #ffffff)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  padding: "3px 8px",
                  borderRadius: 6,
                  background: practice.status === "COMPLETED" ? "#dcfce7" : "#e0f2fe",
                  color: practice.status === "COMPLETED" ? "#166534" : "#0369a1",
                }}
              >
                {practice.status}
              </span>
              <span style={{ fontSize: 13, color: "var(--cq-text-muted, #6b7280)" }}>
                {new Date(practice.scheduledAt).toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <h1 style={{ margin: "0 0 8px 0", fontSize: 24, fontWeight: 700 }}>{practice.title}</h1>
            {practice.focus && (
              <p style={{ margin: "0 0 8px 0", fontSize: 14, color: "var(--cq-text-muted, #4b5563)" }}>
                <strong>Focus:</strong> {practice.focus}
              </p>
            )}
            {practice.location && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--cq-text-muted, #6b7280)" }}>
                📍 {practice.location}
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div
              style={{
                textAlign: "right",
                padding: "8px 16px",
                background: "var(--cq-bg-muted, #f9fafb)",
                borderRadius: 8,
                border: "1px solid var(--cq-border, #e5e7eb)",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--cq-text-muted, #6b7280)", textTransform: "uppercase" }}>
                Total Duration
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--cq-primary, #1e3a8a)" }}>
                {calculatedDuration} <span style={{ fontSize: 13, fontWeight: 500 }}>mins</span>
              </div>
            </div>

            {!readOnly && onSave && (
              <button
                type="button"
                onClick={handleSaveSession}
                disabled={saving}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 14,
                  background: "#1e3a8a",
                  color: "#ffffff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {saving ? "Saving..." : saveSuccess ? "Saved ✓" : "Save Changes"}
              </button>
            )}
          </div>
        </div>

        {/* Duration Progress / Category Distribution Bar */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
            <span style={{ fontWeight: 600 }}>Practice Distribution</span>
            <span>{practice.blocks.length} scheduled blocks</span>
          </div>
          <div
            style={{
              display: "flex",
              height: 12,
              borderRadius: 6,
              overflow: "hidden",
              background: "#e5e7eb",
              gap: 2,
            }}
          >
            {(["WARMUP", "TECHNICAL", "TACTICAL", "SCRIMMAGE", "COOLDOWN"] as DrillCategory[]).map((cat) => {
              const mins = breakdown[cat] || 0;
              if (mins === 0) return null;
              const pct = (mins / Math.max(1, calculatedDuration)) * 100;
              const theme = CATEGORY_THEMES[cat];
              return (
                <div
                  key={cat}
                  title={`${theme.label}: ${mins} mins (${Math.round(pct)}%)`}
                  style={{
                    width: `${pct}%`,
                    background: theme.color,
                    transition: "width 0.3s ease",
                  }}
                />
              );
            })}
          </div>

          {/* Category Chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
            {(["WARMUP", "TECHNICAL", "TACTICAL", "SCRIMMAGE", "COOLDOWN"] as DrillCategory[]).map((cat) => {
              const mins = breakdown[cat] || 0;
              const theme = CATEGORY_THEMES[cat];
              return (
                <div
                  key={cat}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: mins > 0 ? theme.color : "#9ca3af",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: mins > 0 ? theme.color : "#d1d5db",
                    }}
                  />
                  <span>
                    {theme.label}: <strong>{mins}m</strong>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tabs navigation */}
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--cq-border, #e5e7eb)" }}>
        <button
          type="button"
          onClick={() => setActiveTab("timeline")}
          style={{
            padding: "8px 16px",
            border: "none",
            background: "none",
            borderBottom: activeTab === "timeline" ? "2px solid #1e3a8a" : "2px solid transparent",
            fontWeight: activeTab === "timeline" ? 700 : 500,
            color: activeTab === "timeline" ? "#1e3a8a" : "var(--cq-text-muted, #6b7280)",
            cursor: "pointer",
          }}
        >
          Timeline & Blocks ({practice.blocks.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("attendance")}
          style={{
            padding: "8px 16px",
            border: "none",
            background: "none",
            borderBottom: activeTab === "attendance" ? "2px solid #1e3a8a" : "2px solid transparent",
            fontWeight: activeTab === "attendance" ? 700 : 500,
            color: activeTab === "attendance" ? "#1e3a8a" : "var(--cq-text-muted, #6b7280)",
            cursor: "pointer",
          }}
        >
          Attendance ({practice.attendance.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("drills")}
          style={{
            padding: "8px 16px",
            border: "none",
            background: "none",
            borderBottom: activeTab === "drills" ? "2px solid #1e3a8a" : "2px solid transparent",
            fontWeight: activeTab === "drills" ? 700 : 500,
            color: activeTab === "drills" ? "#1e3a8a" : "var(--cq-text-muted, #6b7280)",
            cursor: "pointer",
          }}
        >
          Drill Catalog ({drillsCatalog.length})
        </button>
      </div>

      {/* TIMELINE TAB */}
      {activeTab === "timeline" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>Practice Execution Timeline</h2>
            {!readOnly && (
              <button
                type="button"
                onClick={() => setShowDrillModal(true)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  background: "#1e3a8a",
                  color: "#ffffff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                + Add Drill / Block
              </button>
            )}
          </div>

          {practice.blocks.length === 0 ? (
            <div
              style={{
                padding: 32,
                textAlign: "center",
                border: "2px dashed #d1d5db",
                borderRadius: 8,
                color: "#6b7280",
              }}
            >
              <p style={{ margin: "0 0 12px 0", fontSize: 15 }}>No blocks scheduled for this practice session.</p>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setShowDrillModal(true)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 6,
                    background: "#1e3a8a",
                    color: "#ffffff",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Pick Drill from Catalog
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {practice.blocks.map((block, index) => {
                const theme = CATEGORY_THEMES[block.category] || CATEGORY_THEMES.TECHNICAL;
                return (
                  <div
                    key={block.id || index}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 16,
                      padding: 16,
                      borderRadius: 8,
                      border: `1px solid ${theme.border}`,
                      background: theme.bg,
                    }}
                  >
                    {/* Order Circle */}
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: theme.color,
                        color: "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: 14,
                        flexShrink: 0,
                      }}
                    >
                      {index + 1}
                    </div>

                    {/* Block Info */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: theme.border,
                            color: theme.color,
                            textTransform: "uppercase",
                          }}
                        >
                          {theme.label}
                        </span>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>
                          {block.title}
                        </h3>
                        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 12,
                              background: "#ffffff",
                              border: `1px solid ${theme.border}`,
                              color: theme.color,
                            }}
                          >
                            ⏱ {block.durationMins} mins
                          </span>
                          {!readOnly && (
                            <div style={{ display: "flex", gap: 2 }}>
                              <button
                                type="button"
                                aria-label={`Decrease duration of ${block.title}`}
                                onClick={() => handleBlockChange(index, { durationMins: Math.max(5, block.durationMins - 5) })}
                                style={{
                                  fontSize: 11,
                                  padding: "1px 5px",
                                  borderRadius: 3,
                                  border: "1px solid #d1d5db",
                                  background: "#ffffff",
                                  cursor: "pointer",
                                }}
                              >
                                -5
                              </button>
                              <button
                                type="button"
                                aria-label={`Increase duration of ${block.title}`}
                                onClick={() => handleBlockChange(index, { durationMins: block.durationMins + 5 })}
                                style={{
                                  fontSize: 11,
                                  padding: "1px 5px",
                                  borderRadius: 3,
                                  border: "1px solid #d1d5db",
                                  background: "#ffffff",
                                  cursor: "pointer",
                                }}
                              >
                                +5
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {block.notes && (
                        <p style={{ margin: "4px 0 8px 0", fontSize: 13, color: "#4b5563" }}>
                          {block.notes}
                        </p>
                      )}

                      {/* Links to Tactical Play or Film */}
                      <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                        {block.playId && (
                          <Link
                            href={`/playbook?id=${block.playId}`}
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#4f46e5",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              textDecoration: "none",
                              background: "#ffffff",
                              padding: "2px 8px",
                              borderRadius: 4,
                              border: "1px solid #c7d2fe",
                            }}
                          >
                            🏀 Open Tactical Play
                          </Link>
                        )}
                        {block.clipId && (
                          <span
                            style={{
                              fontSize: 12,
                              color: "#0369a1",
                              background: "#ffffff",
                              padding: "2px 8px",
                              borderRadius: 4,
                              border: "1px solid #bae6fd",
                            }}
                          >
                            📹 Linked Video Clip
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions if not read-only */}
                    {!readOnly && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <button
                          type="button"
                          aria-label={`Remove block ${block.title}`}
                          onClick={() => handleRemoveBlock(index)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#dc2626",
                            fontSize: 16,
                            cursor: "pointer",
                            padding: 4,
                          }}
                          title="Remove block"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ATTENDANCE TAB */}
      {activeTab === "attendance" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>Roster Attendance</h2>
            <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
              <span style={{ color: "#166534" }}><strong>{presentCount}</strong> Present</span>
              <span style={{ color: "#1e40af" }}><strong>{injuredCount}</strong> Injured</span>
              <span style={{ color: "#991b1b" }}><strong>{absentCount}</strong> Absent</span>
            </div>
          </div>

          {practice.attendance.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 8 }}>
              No roster records registered yet for this session.
            </div>
          ) : (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 14 }}>
                <thead style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  <tr>
                    <th style={{ padding: "10px 16px" }}>Player</th>
                    <th style={{ padding: "10px 16px" }}>Status</th>
                    <th style={{ padding: "10px 16px" }}>Quick Toggle</th>
                    <th style={{ padding: "10px 16px" }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {practice.attendance.map((record) => {
                    const theme = ATTENDANCE_THEMES[record.status] || ATTENDANCE_THEMES.PRESENT;
                    return (
                      <tr key={record.userId} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "12px 16px", fontWeight: 600 }}>
                          {record.name || record.userId.slice(0, 8)}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: 4,
                              fontSize: 12,
                              fontWeight: 700,
                              background: theme.bg,
                              color: theme.color,
                            }}
                          >
                            {theme.label}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {!readOnly && (
                            <div style={{ display: "flex", gap: 6 }}>
                              {(["PRESENT", "INJURED", "ABSENT", "EXCUSED"] as AttendanceStatus[]).map((st) => (
                                <button
                                  key={st}
                                  type="button"
                                  onClick={() => handleAttendanceChange(record.userId, st)}
                                  style={{
                                    fontSize: 11,
                                    padding: "3px 8px",
                                    borderRadius: 4,
                                    border: record.status === st ? "2px solid #111827" : "1px solid #d1d5db",
                                    background: record.status === st ? "#f3f4f6" : "#ffffff",
                                    cursor: "pointer",
                                    fontWeight: record.status === st ? 700 : 500,
                                  }}
                                >
                                  {st[0]}
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 13 }}>
                          {record.note || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* DRILLS CATALOG TAB */}
      {activeTab === "drills" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>Team & FIBA Standard Drill Library</h2>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["ALL", "WARMUP", "TECHNICAL", "TACTICAL", "SCRIMMAGE", "COOLDOWN"].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 4,
                    border: selectedCategory === cat ? "2px solid #1e3a8a" : "1px solid #d1d5db",
                    background: selectedCategory === cat ? "#eff6ff" : "#ffffff",
                    color: selectedCategory === cat ? "#1e3a8a" : "#374151",
                    fontWeight: selectedCategory === cat ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {filteredDrills.map((drill) => {
              const theme = CATEGORY_THEMES[drill.category] || CATEGORY_THEMES.TECHNICAL;
              return (
                <div
                  key={drill.id}
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: theme.bg,
                          color: theme.color,
                        }}
                      >
                        {drill.category}
                      </span>
                      <span style={{ fontSize: 12, color: "#6b7280" }}>
                        ⏱ {drill.suggestedDurationMins}m · {drill.intensity}
                      </span>
                    </div>
                    <h4 style={{ margin: "0 0 6px 0", fontSize: 15, fontWeight: 700 }}>{drill.title}</h4>
                    {drill.brief && (
                      <p style={{ margin: 0, fontSize: 13, color: "#4b5563", lineHeight: 1.4 }}>
                        {drill.brief}
                      </p>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {drill.tags?.map((t) => (
                        <span key={t} style={{ fontSize: 11, color: "#6b7280", background: "#f3f4f6", padding: "1px 5px", borderRadius: 4 }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => handleAddDrillToPractice(drill)}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: "4px 10px",
                          borderRadius: 4,
                          background: "#1e3a8a",
                          color: "#ffffff",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        + Add to Plan
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Drill Picker Modal */}
      {showDrillModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add Drill to Practice"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 12,
              padding: 24,
              maxWidth: 600,
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Pick Drill to Append</h3>
              <button
                type="button"
                onClick={() => setShowDrillModal(false)}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {drillsCatalog.map((drill) => (
                <div
                  key={drill.id}
                  style={{
                    padding: 12,
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{drill.title}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {drill.category} · {drill.suggestedDurationMins}m · {drill.intensity}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddDrillToPractice(drill)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      background: "#1e3a8a",
                      color: "#ffffff",
                      fontSize: 12,
                      fontWeight: 600,
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Select
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

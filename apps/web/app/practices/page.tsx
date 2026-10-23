"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PracticePlanner, type PracticeSession, type DrillItem } from "../../lib/practice-planner";
import { api } from "../../lib/api";

const DEFAULT_SAMPLE_PRACTICE: PracticeSession = {
  id: "practice-sample-01",
  teamId: "team-demo-01",
  title: "Mid-Season Tactical Installation & Transition",
  scheduledAt: new Date(Date.now() + 86400000).toISOString(),
  location: "Main Gymnasium — Court 1",
  focus: "Horns set execution, weakside stunt-and-recover rotations, and fastbreak spacing",
  notes: "Wear light/dark reversible scrimmage jerseys. Full contact session.",
  totalDurationMins: 90,
  status: "SCHEDULED",
  createdBy: "coach-01",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  blocks: [
    {
      id: "b1",
      order: 1,
      title: "Dynamic Activation & Finishing Series",
      category: "WARMUP",
      durationMins: 15,
      notes: "Full-court Euro-step, reverse, and floater finishes at game speed.",
    },
    {
      id: "b2",
      order: 2,
      title: "Closeout 1-on-1 with Stunt Recovery",
      category: "TECHNICAL",
      durationMins: 15,
      notes: "Contest hand high, chop feet, 3 dribble limit on offense.",
    },
    {
      id: "b3",
      order: 3,
      title: "Horns Pick & Pop 5-on-0 into 5-on-5",
      category: "TACTICAL",
      durationMins: 25,
      notes: "Execute Horns pop against drop coverage and switch.",
      playId: "preset-horns-pop",
    },
    {
      id: "b4",
      order: 4,
      title: "Continuous 3-on-2 to 2-on-1 Transition",
      category: "SCRIMMAGE",
      durationMins: 25,
      notes: "High pace; offense must score within 7 seconds of rebound.",
    },
    {
      id: "b5",
      order: 5,
      title: "Pressure Free Throws & Cooldown",
      category: "COOLDOWN",
      durationMins: 10,
      notes: "1-and-1 free throws with sprint consequences for misses.",
    },
  ],
  attendance: [
    { userId: "player-01", name: "Marcus Vance (#4)", status: "PRESENT" },
    { userId: "player-02", name: "Elena Rostova (#7)", status: "PRESENT" },
    { userId: "player-03", name: "David Kim (#11)", status: "INJURED", note: "Ankle sprain rehab" },
    { userId: "player-04", name: "Jordan Brooks (#23)", status: "PRESENT" },
    { userId: "player-05", name: "Lucas Silva (#32)", status: "EXCUSED", note: "Academic exam" },
  ],
};

const DEFAULT_SAMPLE_DRILLS: DrillItem[] = [
  {
    id: "drill-01",
    title: "Shell Drill: 4-on-4 Help & Recover",
    category: "TACTICAL",
    intensity: "HIGH",
    suggestedDurationMins: 15,
    brief: "Four perimeter defenders rotate on air passes, jump to the ball, help on baseline drives, and execute weakside stunt & recover.",
    tags: ["defense", "rotations", "shell"],
  },
  {
    id: "drill-02",
    title: "Continuous 3-on-2 to 2-on-1 Transition",
    category: "TACTICAL",
    intensity: "HIGH",
    suggestedDurationMins: 12,
    brief: "Offense attacks 3-on-2; shooter/turnover player hustles back on defense while defensive rebounders outlet into a 2-on-1 break.",
    tags: ["transition", "fastbreak", "advantage"],
  },
  {
    id: "drill-03",
    title: "Dynamic Full-Court Activation & Finishing",
    category: "WARMUP",
    intensity: "MEDIUM",
    suggestedDurationMins: 10,
    brief: "Full-court ball handling series into change-of-direction layups (Euro-step, reverse, floater).",
    tags: ["warmup", "finishing", "activation"],
  },
  {
    id: "drill-04",
    title: "Closeout 1-on-1 with Stunt Recovery",
    category: "TECHNICAL",
    intensity: "HIGH",
    suggestedDurationMins: 10,
    brief: "Defender chops feet on closeout with high contest hand; live 1-on-1 with 3-dribble maximum.",
    tags: ["closeout", "1-on-1", "individual-defense"],
  },
  {
    id: "drill-05",
    title: "Free Throw Pressure & Mental Focus",
    category: "COOLDOWN",
    intensity: "LOW",
    suggestedDurationMins: 5,
    brief: "Each player shoots 1-and-1 free throws; team running sprint penalty for misses to simulate late-game fatigue.",
    tags: ["free-throws", "cooldown", "pressure"],
  },
];

export default function PracticesPage() {
  const qc = useQueryClient();
  const [selectedPractice, setSelectedPractice] = useState<PracticeSession>(DEFAULT_SAMPLE_PRACTICE);

  // Fetch teams of current user
  const teamsQuery = useQuery({
    queryKey: ["teams"],
    queryFn: () => api<{ items: Array<{ id: string; name: string }> }>("/teams").catch(() => ({ items: [] })),
  });

  const teamId = teamsQuery.data?.items?.[0]?.id;

  // Fetch practices if team is available
  const practicesQuery = useQuery({
    queryKey: ["practices", teamId],
    queryFn: () => api<{ items: PracticeSession[] }>(`/teams/${teamId}/practices`),
    enabled: !!teamId,
  });

  // Fetch drills catalog
  const drillsQuery = useQuery({
    queryKey: ["drills", teamId],
    queryFn: () => api<{ items: DrillItem[] }>(`/teams/${teamId}/drills`),
    enabled: !!teamId,
  });

  const drills = drillsQuery.data?.items?.length ? drillsQuery.data.items : DEFAULT_SAMPLE_DRILLS;

  const saveMutation = useMutation({
    mutationFn: async (updated: PracticeSession) => {
      if (!teamId || updated.id.startsWith("practice-sample")) {
        setSelectedPractice(updated);
        return updated;
      }
      return api<PracticeSession>(`/practices/${updated.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: updated.title,
          scheduledAt: updated.scheduledAt,
          location: updated.location ?? undefined,
          focus: updated.focus ?? undefined,
          notes: updated.notes ?? undefined,
          blocks: updated.blocks,
          status: updated.status,
        }),
      });
    },
    onSuccess: (data) => {
      setSelectedPractice(data);
      qc.invalidateQueries({ queryKey: ["practices", teamId] });
    },
  });

  const attendanceMutation = useMutation({
    mutationFn: async (records: PracticeSession["attendance"]) => {
      if (!teamId || selectedPractice.id.startsWith("practice-sample")) {
        setSelectedPractice((prev) => ({ ...prev, attendance: records }));
        return;
      }
      await api(`/practices/${selectedPractice.id}/attendance`, {
        method: "POST",
        body: JSON.stringify({ attendance: records }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["practices", teamId] });
    },
  });

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 6px 0", fontSize: 28, fontWeight: 800 }}>Practice Planner & Drill Management</h1>
        <p style={{ margin: 0, color: "var(--cq-text-muted, #6b7280)", fontSize: 15 }}>
          Sequence structured practice blocks, calculate session load & durations, link tactical plays, and track squad attendance.
        </p>
        {practicesQuery.data?.items && practicesQuery.data.items.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <label htmlFor="practice-select" style={{ fontSize: 14, fontWeight: 600 }}>Switch Session:</label>
            <select
              id="practice-select"
              value={selectedPractice.id}
              onChange={(e) => {
                const found = practicesQuery.data?.items.find((p) => p.id === e.target.value);
                if (found) setSelectedPractice(found);
              }}
              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}
            >
              {practicesQuery.data.items.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <PracticePlanner
        practice={selectedPractice}
        drillsCatalog={drills}
        onSave={async (updated) => {
          await saveMutation.mutateAsync(updated);
        }}
        onAttendanceUpdate={async (attendance) => {
          await attendanceMutation.mutateAsync(attendance);
        }}
      />
    </main>
  );
}

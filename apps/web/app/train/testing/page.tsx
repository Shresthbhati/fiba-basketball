"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import {
  AthleticTestingView,
  type CombineProfile,
  type Protocol,
  type TestSession,
} from "../../../lib/athletic-testing";

const FALLBACK_PROTOCOLS: Protocol[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    slug: "standing-vertical-jump",
    name: "Standing Vertical Jump",
    category: "JUMP",
    description: "Bilateral countermovement jump with no approach step.",
    primaryMetricUnit: "cm",
    sortDirection: "DESC",
    equipmentRequirements: "Calibrated Vertec vanes or optical flight mat.",
    warmupRecommendations: "Dynamic hip flexor and calf mobility, 3 submaximal jumps.",
    standardAttempts: 3,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    slug: "max-vertical-jump",
    name: "Maximum Vertical Jump",
    category: "JUMP",
    description: "Full approach running jump.",
    primaryMetricUnit: "cm",
    sortDirection: "DESC",
    equipmentRequirements: "Calibrated Vertec vanes positioned away from obstructions.",
    warmupRecommendations: "Progressive approach jumps with controlled landings.",
    standardAttempts: 3,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    slug: "three-quarter-court-sprint",
    name: "3/4 Court Sprint (22.86m)",
    category: "SPEED",
    description: "Linear transition sprint from baseline to opposite free-throw line.",
    primaryMetricUnit: "seconds",
    sortDirection: "ASC",
    equipmentRequirements: "Dual-beam electronic timing gates at 0m and 22.86m.",
    warmupRecommendations: "Sprint drills: high knees, A-skips, build-up accelerations.",
    standardAttempts: 3,
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    slug: "lane-agility-drill",
    name: "Lane Agility Drill (5.8m x 4.9m)",
    category: "AGILITY",
    description: "Standard FIBA/NBA perimeter key drill: sprint, slide, backpedal, slide, and reverse.",
    primaryMetricUnit: "seconds",
    sortDirection: "ASC",
    equipmentRequirements: "Electronic timing gates, 4 lane cones.",
    warmupRecommendations: "Defensive slide progressions, cone figure-eights.",
    standardAttempts: 2,
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    slug: "pro-agility-shuttle",
    name: "Pro-Agility Shuttle (5-10-5)",
    category: "AGILITY",
    description: "Lateral 5-10-5 change-of-direction test.",
    primaryMetricUnit: "seconds",
    sortDirection: "ASC",
    equipmentRequirements: "Timing gates on center line, 3 taped lines.",
    warmupRecommendations: "Lateral lunges, plant-and-cut drills.",
    standardAttempts: 3,
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    slug: "yoyo-intermittent-recovery-1",
    name: "Yo-Yo Intermittent Recovery Level 1",
    category: "CONDITIONING",
    description: "Progressive 2x20m shuttle test with 10s active recovery intervals.",
    primaryMetricUnit: "level_shuttle",
    sortDirection: "DESC",
    equipmentRequirements: "Standardized audio track, 20m running course.",
    warmupRecommendations: "5 minutes light jog, dynamic leg swings.",
    standardAttempts: 1,
  },
];

const FALLBACK_PROFILE: CombineProfile = {
  athlete: {
    id: "demo-athlete",
    displayName: "Alex Rivera",
    dateOfBirth: "2004-03-15",
  },
  cohort: "COLLEGIATE_MALE",
  signature: {
    powerPercentile: 65,
    speedPercentile: 72,
    agilityPercentile: 68,
    conditioningPercentile: 55,
    combineIndex: 65,
    testsCompleted: 4,
  },
  personalBests: [
    {
      slug: "standing-vertical-jump",
      name: "Standing Vertical Jump",
      category: "JUMP",
      unit: "cm",
      bestValue: 74.0,
      percentile: 62,
      instrumentType: "VERTEC_VANES",
      sourceType: "COACH",
      achievedDate: "2026-10-15",
      sessionId: "session-1",
    },
    {
      slug: "max-vertical-jump",
      name: "Maximum Vertical Jump",
      category: "JUMP",
      unit: "cm",
      bestValue: 88.0,
      percentile: 67,
      instrumentType: "VERTEC_VANES",
      sourceType: "COACH",
      achievedDate: "2026-10-15",
      sessionId: "session-1",
    },
    {
      slug: "three-quarter-court-sprint",
      name: "3/4 Court Sprint (22.86m)",
      category: "SPEED",
      unit: "seconds",
      bestValue: 3.22,
      percentile: 72,
      instrumentType: "TIMING_GATES_DUAL_BEAM",
      sourceType: "OFFICIAL",
      achievedDate: "2026-10-15",
      sessionId: "session-1",
    },
    {
      slug: "lane-agility-drill",
      name: "Lane Agility Drill (5.8m x 4.9m)",
      category: "AGILITY",
      unit: "seconds",
      bestValue: 10.75,
      percentile: 68,
      instrumentType: "TIMING_GATES_DUAL_BEAM",
      sourceType: "OFFICIAL",
      achievedDate: "2026-10-15",
      sessionId: "session-1",
    },
  ],
};

const FALLBACK_SESSIONS: TestSession[] = [
  {
    id: "session-1",
    testDate: "2026-10-15",
    location: "Metro Training Facility",
    surface: "HARDWOOD",
    notes: "Official pre-season combine testing session",
    attemptCount: 8,
  },
];

export default function AthleticTestingPage() {
  const [protocols, setProtocols] = useState<Protocol[]>(FALLBACK_PROTOCOLS);
  const [profile, setProfile] = useState<CombineProfile>(FALLBACK_PROFILE);
  const [sessions, setSessions] = useState<TestSession[]>(FALLBACK_SESSIONS);

  useEffect(() => {
    async function loadData() {
      try {
        const protoRes = await api<{ items: Protocol[] }>("/athletic-testing/protocols");
        if (protoRes?.items?.length) setProtocols(protoRes.items);

        const sessRes = await api<{ items: TestSession[] }>("/athletic-testing/sessions");
        if (sessRes?.items) setSessions(sessRes.items);
      } catch {
        // Fallback to demo combine data on network/auth error
      }
    }
    loadData();
  }, []);

  const handleSaveAttempt = async (attempt: {
    sessionId?: string;
    protocolId: string;
    rawValue: number;
    isFault?: boolean;
    faultReason?: string;
    instrumentType?: string;
    sourceType?: "OFFICIAL" | "COACH" | "SELF_REPORTED" | "CV_ESTIMATE";
    notes?: string;
  }) => {
    // If no existing session, create one today
    let targetSessionId = attempt.sessionId || sessions[0]?.id;
    if (!targetSessionId) {
      try {
        const created = await api<TestSession>("/athletic-testing/sessions", {
          method: "POST",
          body: {
            testDate: new Date().toISOString().split("T")[0],
            surface: "HARDWOOD",
          },
        });
        targetSessionId = created.id;
        setSessions((prev) => [created, ...prev]);
      } catch {
        targetSessionId = "local-session";
      }
    }

    try {
      await api(`/athletic-testing/sessions/${targetSessionId}/attempts`, {
        method: "POST",
        body: attempt,
      });
    } catch {
      // In offline / fallback mode, update local state
    }

    const proto = protocols.find((p) => p.id === attempt.protocolId);
    if (proto && !attempt.isFault) {
      setProfile((prev) => {
        const existing = prev.personalBests.find((pb) => pb.slug === proto.slug);
        const isBetter =
          !existing ||
          (proto.sortDirection === "DESC"
            ? attempt.rawValue > existing.bestValue
            : attempt.rawValue < existing.bestValue);

        if (!isBetter) return prev;

        const updatedPb = {
          slug: proto.slug,
          name: proto.name,
          category: proto.category,
          unit: proto.primaryMetricUnit,
          bestValue: attempt.rawValue,
          percentile: 70, // Optimistic approximation
          instrumentType: attempt.instrumentType || "VERTEC_VANES",
          sourceType: attempt.sourceType || "SELF_REPORTED",
          achievedDate: new Date().toISOString().split("T")[0]!,
          sessionId: targetSessionId!,
        };

        const nextPbs = prev.personalBests.filter((x) => x.slug !== proto.slug).concat(updatedPb);
        return {
          ...prev,
          personalBests: nextPbs,
        };
      });
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <Link href="/train" className="hover:text-zinc-200">
          Train
        </Link>
        <span>/</span>
        <span className="text-zinc-200">Combine & Athletic Testing</span>
      </div>

      <AthleticTestingView
        initialProtocols={protocols}
        initialProfile={profile}
        initialSessions={sessions}
        onSaveAttempt={handleSaveAttempt}
      />
    </main>
  );
}

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ScoutEvaluationCard } from "../lib/scout-evaluation-card";

describe("ScoutEvaluationCard Component (Spec §13.1–§13.4, §14.2)", () => {
  const sampleCompetencies = {
    shooting: { present: 60, future: 70, stdDev: 3.5 },
    finishing: { present: 55, future: 65, stdDev: 2.1 },
    playmaking: { present: 50, future: 55, stdDev: 1.8 },
    perimeterDefense: { present: 65, future: 75, stdDev: 4.2 },
    interiorDefense: { present: 50, future: 55, stdDev: 2.0 },
    rebounding: { present: 45, future: 50, stdDev: 2.5 },
    athleticism: { present: 70, future: 70, stdDev: 0.0 },
    basketballIq: { present: 60, future: 70, stdDev: 3.1 },
  };

  it("renders athlete name, position, organization, and player comparison", () => {
    render(
      <ScoutEvaluationCard
        athleteName="Darius Miller"
        athletePosition="SG/SF"
        scoutName="Marcus Vance"
        organization="Boston Celtics Personnel"
        evalDate="2026-10-24"
        projectedRole="3_AND_D_WING"
        playerComparison="Mikal Bridges"
        overallPresent={57}
        overallFuture={66}
        competencies={sampleCompetencies}
        strengthsSummary="High motor, lockdown on-ball slides, and repeatable corner 3-point stroke."
        weaknessesSummary="Limited primary self-creation in iso settings."
        swingSkills="Above-the-break pull-up jumper."
        intangiblesNotes="High character, coachable, communicates defensively."
      />
    );

    expect(screen.getByText(/Darius Miller/i)).toBeDefined();
    expect(screen.getByText(/SG\/SF/i)).toBeDefined();
    expect(screen.getByText(/Marcus Vance/i)).toBeDefined();
    expect(screen.getByText(/Boston Celtics Personnel/i)).toBeDefined();
    expect(screen.getByText(/3 And D Wing/i)).toBeDefined();
    expect(screen.getByText(/Mikal Bridges/i)).toBeDefined();
  });

  it("displays 20-80 competencies with present and future metrics", () => {
    render(
      <ScoutEvaluationCard
        athleteName="Darius Miller"
        projectedRole="3_AND_D_WING"
        overallPresent={57}
        overallFuture={66}
        competencies={sampleCompetencies}
        strengthsSummary="High motor."
        weaknessesSummary="Limited self-creation."
      />
    );

    // Present / Future overall headers
    expect(screen.getByText("57")).toBeDefined();
    expect(screen.getByText("66")).toBeDefined();

    // Core competency labels
    expect(screen.getByText(/Shooting & Touch/i)).toBeDefined();
    expect(screen.getByText(/Perimeter Defense/i)).toBeDefined();
    expect(screen.getByText(/Basketball IQ & Anticipation/i)).toBeDefined();
  });

  it("displays consensus controls and handles edit/export actions", () => {
    const handleEdit = vi.fn();
    const handleExport = vi.fn();

    render(
      <ScoutEvaluationCard
        athleteName="Darius Miller"
        projectedRole="3_AND_D_WING"
        overallPresent={57}
        overallFuture={66}
        competencies={sampleCompetencies}
        strengthsSummary="High motor."
        weaknessesSummary="Limited self-creation."
        consensus={{
          uniqueScouts: 4,
          totalEvaluations: 6,
          agreementStdDev: 2.8,
        }}
        onEdit={handleEdit}
        onExport={handleExport}
      />
    );

    const consensusTabBtn = screen.getByRole("button", { name: /Consensus \(4 Scouts\)/i });
    expect(consensusTabBtn).toBeDefined();

    const editBtn = screen.getByRole("button", { name: /Edit/i });
    fireEvent.click(editBtn);
    expect(handleEdit).toHaveBeenCalledTimes(1);

    const exportBtn = screen.getByRole("button", { name: /Export Dossier/i });
    fireEvent.click(exportBtn);
    expect(handleExport).toHaveBeenCalledTimes(1);
  });
});

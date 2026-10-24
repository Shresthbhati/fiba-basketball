import { describe, expect, it } from "vitest";
import {
  exportPlayKeyframeToSvg,
  exportPlayToMultiFrameSvg,
  generateTacticalPlaybookPrintHtml,
  generatePracticePlanPrintHtml,
  type TacticalPlay,
  type TacticalKeyframe,
  type PracticePrintData,
} from "../src";

const SAMPLE_KEYFRAME: TacticalKeyframe = {
  step: 1,
  description: "Initial Horns Formation: 1 at point, 4 & 5 at elbows, 2 & 3 in corners.",
  tokens: [
    { id: "o1", type: "offense", label: "1", x: 7.0, y: 0.0 },
    { id: "o2", type: "offense", label: "2", x: 13.0, y: -6.5 },
    { id: "o3", type: "offense", label: "3", x: 13.0, y: 6.5 },
    { id: "o4", type: "offense", label: "4", x: 8.5, y: -2.5 },
    { id: "o5", type: "offense", label: "5", x: 8.5, y: 2.5 },
    { id: "d1", type: "defense", label: "x1", x: 8.0, y: 0.0 },
    { id: "ball", type: "ball", label: "ball", x: 7.0, y: 0.0 },
  ],
  actions: [
    { id: "a1", type: "cut", from: { x: 7.0, y: 0.0 }, to: { x: 9.0, y: 1.0 }, label: "Drive" },
    { id: "a2", type: "screen", from: { x: 8.5, y: -2.5 }, to: { x: 8.0, y: 0.0 }, label: "Pick" },
    { id: "a3", type: "pass", from: { x: 7.0, y: 0.0 }, to: { x: 13.0, y: -6.5 }, label: "Kick" },
    { id: "a4", type: "dribble", from: { x: 7.0, y: 0.0 }, to: { x: 8.5, y: -1.0 } },
  ],
};

const SAMPLE_PLAY: TacticalPlay = {
  id: "play-horns-1",
  title: "Horns Flare & Slip",
  description: "High elbow ball-screen series with weakside flare screen and dive to the rim.",
  category: "offense",
  courtMode: "half",
  tags: ["horns", "flare", "quick-hitter"],
  version: 2,
  keyframes: [
    SAMPLE_KEYFRAME,
    {
      step: 2,
      description: "Screen & Flare: 4 sets flare for 2; 5 dives to basket.",
      tokens: [
        { id: "o1", type: "offense", label: "1", x: 9.0, y: 1.0 },
        { id: "o2", type: "offense", label: "2", x: 6.0, y: -4.5 },
        { id: "o5", type: "offense", label: "5", x: 12.0, y: 0.0 },
      ],
      actions: [],
    },
  ],
};

const SAMPLE_PRACTICE: PracticePrintData = {
  title: "Pre-Tournament Tactical Installation",
  scheduledAt: "2026-10-25T17:00:00Z",
  location: "Barclays Training Center Court 1",
  focus: "Late-clock execution & Transition defense rotations",
  notes: "Bring high-intensity energy. Coaches will film defensive sets.",
  totalDurationMins: 90,
  blocks: [
    {
      order: 1,
      title: "Dynamic Activation & Mobility",
      category: "WARMUP",
      durationMins: 15,
      intensity: "LOW",
      notes: "Bands, hip opening, close-out deceleration drills.",
    },
    {
      order: 2,
      title: "Horns Action & Set Piece Timing",
      category: "TACTICAL",
      durationMins: 30,
      intensity: "HIGH",
      notes: "5v0 walkthrough followed by 5v5 live shell with 14s shot clock.",
      equipment: "6 basketballs, shot clock remote, cones.",
    },
    {
      order: 3,
      title: "Full Court Scrimmage (4-minute mini games)",
      category: "SCRIMMAGE",
      durationMins: 35,
      intensity: "HIGH",
      notes: "Down 4 with 2:00 remaining scenarios.",
    },
    {
      order: 4,
      title: "Free Throws & Static Recovery",
      category: "COOLDOWN",
      durationMins: 10,
      intensity: "LOW",
      notes: "Make 2 in a row before departing.",
    },
  ],
  attendees: [
    { name: "Marcus Smart", status: "PRESENT" },
    { name: "Jaylen Brown", status: "PRESENT" },
    { name: "Jayson Tatum", status: "PRESENT" },
  ],
};

describe("Vector Export & Practice Plan Generator (Spec §10.3, §10.4)", () => {
  it("exports a single keyframe to a valid XML SVG string with markers and tokens", () => {
    const svg = exportPlayKeyframeToSvg(SAMPLE_KEYFRAME, {
      width: 800,
      height: 600,
      theme: "light",
      stepTitle: "Step 1: Horns Setup",
    });

    expect(svg).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 800 600"');
    expect(svg).toContain("marker-cut-light");
    expect(svg).toContain("marker-pass-light");
    expect(svg).toContain("marker-dribble-light");
    expect(svg).toContain("Step 1: Horns Setup");

    // Tokens
    expect(svg).toContain('data-token-id="o1"');
    expect(svg).toContain('data-token-id="d1"');
    expect(svg).toContain('data-token-id="ball"');
    expect(svg).toContain(">1</text>");
    expect(svg).toContain(">x1</text>");

    // Actions
    expect(svg).toContain("Drive");
    expect(svg).toContain("Pick");
    expect(svg).toContain("Kick");
  });

  it("exports keyframe in dark and monochrome themes", () => {
    const darkSvg = exportPlayKeyframeToSvg(SAMPLE_KEYFRAME, { theme: "dark" });
    expect(darkSvg).toContain("#0d0e12"); // dark bg
    expect(darkSvg).toContain("marker-cut-dark");

    const monoSvg = exportPlayKeyframeToSvg(SAMPLE_KEYFRAME, { theme: "monochrome" });
    expect(monoSvg).toContain("#000000"); // black lines
    expect(monoSvg).toContain("marker-cut-monochrome");
  });

  it("exports multi-frame composite SVG with play title and frame grid", () => {
    const multiSvg = exportPlayToMultiFrameSvg(SAMPLE_PLAY, {
      theme: "light",
      frameWidth: 400,
      frameHeight: 300,
    });

    expect(multiSvg).toContain("Horns Flare &amp; Slip");
    expect(multiSvg).toContain("COURT IQ Tactical Playbook");
    expect(multiSvg).toContain("Frame 1:");
    expect(multiSvg).toContain("Frame 2:");
  });

  it("generates executive print-ready tactical playbook HTML", () => {
    const html = generateTacticalPlaybookPrintHtml(SAMPLE_PLAY, {
      teamName: "Brooklyn Brawlers",
      authorName: "Coach Miller",
      notes: "Force middle on defense, weakside wing must crash the glass.",
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Horns Flare &amp; Slip — Tactical Playbook");
    expect(html).toContain("Brooklyn Brawlers");
    expect(html).toContain("Coach Miller");
    expect(html).toContain("STEP 1");
    expect(html).toContain("STEP 2");
    expect(html).toContain("Player Responsibilities by Step");
    expect(html).toContain("Force middle on defense");
    expect(html).toContain("@media print");
    expect(html).toContain("window.print()");
  });

  it("generates executive print-ready practice plan HTML", () => {
    const html = generatePracticePlanPrintHtml(SAMPLE_PRACTICE, {
      teamName: "Brooklyn Brawlers",
      headCoach: "Coach Miller",
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Pre-Tournament Tactical Installation — Practice Plan");
    expect(html).toContain("Brooklyn Brawlers");
    expect(html).toContain("Coach Miller");
    expect(html).toContain("90 minutes");
    expect(html).toContain("Dynamic Activation &amp; Mobility");
    expect(html).toContain("Horns Action &amp; Set Piece Timing");
    expect(html).toContain("Full Court Scrimmage");
    expect(html).toContain("Roster Attendance Check-Off");
    expect(html).toContain("Marcus Smart");
    expect(html).toContain("Jaylen Brown");
    expect(html).toContain("Jayson Tatum");
  });
});

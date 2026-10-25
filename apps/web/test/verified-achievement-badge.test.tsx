import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  VerifiedAchievementBadge,
  type VerifiedAchievementItem,
} from "../lib/verified-achievement-badge";

const mockActiveAchievement: VerifiedAchievementItem = {
  id: "ach-101",
  title: "Tournament MVP & Scoring Leader",
  category: "AWARD",
  issuer: "FIBA Continental Cup",
  verifiedAt: "2026-10-24T18:00:00.000Z",
  signature: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
  evidenceUrl: "https://courtiq.io/matches/m-999/box-score",
  evidenceRef: "match:m-999",
  isRevoked: false,
};

const mockRevokedAchievement: VerifiedAchievementItem = {
  id: "ach-102",
  title: "All-Tournament First Team",
  category: "SELECTION",
  issuer: "National Youth Championship",
  verifiedAt: "2026-10-20T12:00:00.000Z",
  signature: "11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff",
  evidenceUrl: "https://courtiq.io/tournaments/t-1/awards",
  isRevoked: true,
  revocationReason: "Disciplinary committee overturned award due to roster irregularity",
};

describe("VerifiedAchievementBadge Component (Spec §11.2, WP-8.2)", () => {
  it("renders active achievement details, issuer, and evidence link", () => {
    render(<VerifiedAchievementBadge achievement={mockActiveAchievement} />);

    expect(screen.getByText("Tournament MVP & Scoring Leader")).toBeDefined();
    expect(screen.getByText("FIBA Continental Cup")).toBeDefined();
    expect(screen.getByText("AWARD")).toBeDefined();

    const evidenceLink = screen.getByTestId("evidence-link-ach-101");
    expect(evidenceLink).toBeDefined();
    expect(evidenceLink.getAttribute("href")).toBe("https://courtiq.io/matches/m-999/box-score");
  });

  it("opens cryptographic proof modal and displays HMAC signature hash", () => {
    render(<VerifiedAchievementBadge achievement={mockActiveAchievement} />);

    const inspectBtn = screen.getByTestId("inspect-proof-btn-ach-101");
    fireEvent.click(inspectBtn);

    const modal = screen.getByRole("dialog");
    expect(modal).toBeDefined();
    expect(screen.getByText(/CRYPTOGRAPHIC INTEGRITY VERIFIED \(HMAC-SHA256\)/i)).toBeDefined();
    expect(
      screen.getByText("a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90")
    ).toBeDefined();

    // Close button dismisses modal
    const closeBtn = screen.getByRole("button", { name: "Close" });
    fireEvent.click(closeBtn);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders revoked state and displays revocation reason in proof modal", () => {
    render(<VerifiedAchievementBadge achievement={mockRevokedAchievement} />);

    expect(screen.getByText("REVOKED")).toBeDefined();

    const inspectBtn = screen.getByTestId("inspect-proof-btn-ach-102");
    fireEvent.click(inspectBtn);

    expect(screen.getByText(/ACHIEVEMENT REVOKED BY ISSUING AUTHORITY/i)).toBeDefined();
    expect(
      screen.getByText(/Disciplinary committee overturned award due to roster irregularity/i)
    ).toBeDefined();
  });
});

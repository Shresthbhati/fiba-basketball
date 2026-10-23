import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "../src/components/Badge";
import { SourceBadge } from "../src/components/SourceBadge";
import { VerificationBadge } from "../src/components/VerificationBadge";

describe("Badges", () => {
  it("renders Badge with children and variant", () => {
    render(<Badge variant="brand">Tournament</Badge>);
    expect(screen.getByText("Tournament")).toBeTruthy();
  });

  it("renders VerificationBadge for OFFICIAL status with accessible title and icon", () => {
    render(<VerificationBadge status="OFFICIAL" />);
    const badge = screen.getByLabelText(/Verification status: Official/i);
    expect(badge).toBeTruthy();
    expect(screen.getByText("Official")).toBeTruthy();
  });

  it("renders SourceBadge with confidence rating", () => {
    render(<SourceBadge sourceType="CV_ESTIMATE" confidence={0.92} />);
    const badge = screen.getByLabelText(/Source CV Track, 92% confidence/i);
    expect(badge).toBeTruthy();
    expect(screen.getByText("CV Track")).toBeTruthy();
    expect(screen.getByText(/92%/)).toBeTruthy();
  });
});

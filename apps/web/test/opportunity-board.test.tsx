import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OpportunityBoard } from "../lib/opportunity-board";
import * as apiModule from "../lib/api";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockOpportunities = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    title: "Seattle Metro U18 Varsity Tryouts",
    slug: "seattle-metro-u18-tryouts",
    type: "TEAM_TRYOUT",
    organizationName: "PNW Basketball Academy",
    description: "Annual varsity squad tryouts.",
    requirements: "Reversible jersey required.",
    verificationStatus: "VERIFIED",
    locationName: "Seattle Fieldhouse",
    address: "100 Broadway",
    city: "Seattle",
    country: "USA",
    startDate: "2026-11-01T10:00:00Z",
    endDate: "2026-11-01T14:00:00Z",
    applicationDeadline: "2026-10-31T23:59:59Z",
    costCents: 2000,
    currency: "USD",
    contactEmail: "coach@pnw.org",
    ageGroup: "U18",
    minAge: 15,
    maxAge: 18,
    gender: "MEN",
    positions: ["PG", "SG"],
    skillLevel: "ADVANCED",
    capacity: 30,
  },
];

describe("OpportunityBoard Component (WP-8.3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders opportunity cards with verification status and tags", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (url) => {
      if (typeof url === "string" && url.startsWith("/opportunities")) {
        return { items: mockOpportunities } as never;
      }
      return {} as never;
    });

    renderWithClient(<OpportunityBoard />);

    expect(screen.getByText("Opportunity Directory & Tryouts")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Seattle Metro U18 Varsity Tryouts")).toBeDefined();
    });

    expect(screen.getByText("PNW Basketball Academy")).toBeDefined();
    expect(screen.getByText("VERIFIED")).toBeDefined();
    expect(screen.getByText("TEAM TRYOUT")).toBeDefined();
    expect(screen.getByText("Apply / Register")).toBeDefined();
  });

  it("opens application dialog and allows applicant to apply", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (url) => {
      if (typeof url === "string" && url.startsWith("/opportunities")) {
        return { items: mockOpportunities } as never;
      }
      return {} as never;
    });

    renderWithClient(<OpportunityBoard />);

    await waitFor(() => {
      expect(screen.getByText("Apply / Register")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Apply / Register"));

    expect(screen.getByText("Apply: Seattle Metro U18 Varsity Tryouts")).toBeDefined();
    expect(screen.getByText("Submit Application")).toBeDefined();
    expect(screen.getByText("Applicant is under 18 years old")).toBeDefined();
  });
});

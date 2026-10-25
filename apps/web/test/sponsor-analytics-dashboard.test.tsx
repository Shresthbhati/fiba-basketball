import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  SponsorAnalyticsDashboard,
  type CourtAnalyticsData,
  type CompetitionAnalyticsData,
  type SponsorGrant,
  type SponsorProfile,
  type QueryAuditLogItem,
} from "../lib/sponsor-analytics-dashboard";
import * as apiModule from "../lib/api";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockProfile: SponsorProfile = {
  id: "sp-001",
  userId: "user-sponsor",
  companyName: "Apex Athletics Gear",
  contactEmail: "partnerships@apexathletics.test",
  brandCategory: "APPAREL",
  websiteUrl: "https://apexathletics.test",
  status: "ACTIVE",
};

const mockGrants: SponsorGrant[] = [
  {
    id: "grant-001",
    sponsorId: "sp-001",
    courtId: "court-100",
    competitionId: null,
    scope: "COURT",
    grantedBy: "user-manager",
    expiresAt: null,
    createdAt: "2026-10-20T10:00:00Z",
  },
  {
    id: "grant-002",
    sponsorId: "sp-001",
    courtId: null,
    competitionId: "comp-200",
    scope: "COMPETITION",
    grantedBy: "user-organizer",
    expiresAt: null,
    createdAt: "2026-10-22T10:00:00Z",
  },
];

const mockCourtAnalytics: CourtAnalyticsData = {
  courtId: "court-100",
  courtName: "Downtown Metropolitan Hoops Arena",
  kThreshold: 5,
  totalUniqueAthletesSuppressed: false,
  totalUniqueAthletesDisplay: "28",
  totalSessions: 14,
  totalPickupGames: 8,
  totalReservations: 6,
  demographicsSuppressed: false,
  ageCohorts: [
    {
      label: "Under 18 (Youth)",
      category: "UNDER_18",
      count: 0,
      isSuppressed: true,
      displayCount: "< 5 (Suppressed for Privacy)",
    },
    {
      label: "18-24 (Collegiate / Young Adult)",
      category: "18_TO_24",
      count: 16,
      isSuppressed: false,
      displayCount: "16",
      percentage: 57.1,
    },
    {
      label: "25-34 (Prime Amateur)",
      category: "25_TO_34",
      count: 10,
      isSuppressed: false,
      displayCount: "10",
      percentage: 35.7,
    },
    {
      label: "35+ (Masters / Veterans)",
      category: "35_PLUS",
      count: 0,
      isSuppressed: true,
      displayCount: "< 5 (Suppressed for Privacy)",
    },
  ],
  skillDistribution: [
    {
      label: "Casual / Open Play",
      category: "CASUAL",
      count: 6,
      isSuppressed: false,
      displayCount: "6",
      percentage: 42.9,
    },
    {
      label: "Intermediate",
      category: "INTERMEDIATE",
      count: 8,
      isSuppressed: false,
      displayCount: "8",
      percentage: 57.1,
    },
  ],
  hourlyActivity: [],
  dayOfWeekActivity: [],
  suppressedBucketCount: 2,
  complianceNotice: "k-Anonymity (k >= 5) enforced per Spec §8.6 & §24.2.",
};

const mockCompAnalytics: CompetitionAnalyticsData = {
  competitionId: "comp-200",
  competitionName: "Metropolitan Summer Classic",
  format: "ROUND_ROBIN",
  kThreshold: 5,
  totalTeams: 8,
  totalMatches: 24,
  completedMatches: 18,
  totalRosteredAthletesSuppressed: false,
  totalRosteredAthletesDisplay: "80",
  demographicsSuppressed: false,
  ageCohorts: [
    {
      label: "18-24 (Collegiate / U24)",
      category: "18_TO_24",
      count: 60,
      isSuppressed: false,
      displayCount: "60",
      percentage: 75,
    },
    {
      label: "25-34 (Open Senior)",
      category: "25_TO_34",
      count: 20,
      isSuppressed: false,
      displayCount: "20",
      percentage: 25,
    },
  ],
  stageBreakdown: [],
  suppressedBucketCount: 0,
  complianceNotice: "k-Anonymity (k >= 5) enforced per Spec §8.6 & §24.2.",
};

const mockAuditLogs: QueryAuditLogItem[] = [
  {
    id: "audit-001",
    queryType: "COURT_ANALYTICS",
    resourceId: "court-100-uuid",
    kThreshold: 5,
    suppressedBuckets: 2,
    createdAt: "2026-10-24T12:00:00Z",
  },
];

describe("SponsorAnalyticsDashboard Component (WP-8.6, Spec §8.6, §24.2)", () => {
  beforeEach(() => {
    vi.spyOn(apiModule, "api").mockImplementation((url: string) => {
      if (url.includes("/api/v1/sponsors/me")) {
        return Promise.resolve({ profile: mockProfile });
      }
      if (url.includes("/api/v1/sponsors/grants")) {
        return Promise.resolve({ items: mockGrants });
      }
      if (url.includes("/api/v1/sponsors/analytics/courts/")) {
        return Promise.resolve(mockCourtAnalytics);
      }
      if (url.includes("/api/v1/sponsors/analytics/competitions/")) {
        return Promise.resolve(mockCompAnalytics);
      }
      if (url.includes("/api/v1/sponsors/analytics/audit-log")) {
        return Promise.resolve({ items: mockAuditLogs });
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders sponsor dashboard header, brand badge, and k-anonymity compliance banner", async () => {
    renderWithClient(<SponsorAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Apex Athletics Gear")).toBeDefined();
    });

    expect(screen.getByText("APPAREL")).toBeDefined();
    expect(screen.getByText(/k-Anonymity Verified \(k ≥ 5\)/)).toBeDefined();
    expect(screen.getByText(/k-Anonymity Privacy Guardrails Enforced/)).toBeDefined();
  });

  it("renders court analytics metrics and masks cohorts with fewer than k=5 entries", async () => {
    renderWithClient(<SponsorAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("court-analytics-content")).toBeDefined();
    });

    // Check KPI metrics
    expect(screen.getByTestId("total-sessions-metric").textContent).toBe("14");
    expect(screen.getByTestId("unique-athletes-metric").textContent).toBe("28");
    expect(screen.getByTestId("suppressed-buckets-metric").textContent).toBe("2");

    // Age cohorts: Youth (< 5) is suppressed, Collegiate (16) is shown
    expect(screen.getAllByText(/< 5 \(Suppressed for Privacy\)/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("16 (57.1%)")).toBeDefined();
    expect(screen.getByText("10 (35.7%)")).toBeDefined();
  });

  it("switches to competition analytics tab and renders tournament metrics", async () => {
    renderWithClient(<SponsorAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("tab-comp-analytics")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("tab-comp-analytics"));

    await waitFor(() => {
      expect(screen.getByTestId("competition-analytics-content")).toBeDefined();
    });

    expect(screen.getByTestId("total-teams-metric").textContent).toBe("8");
    expect(screen.getByTestId("rostered-athletes-metric").textContent).toBe("80");
    expect(screen.getByText("60 (75%)")).toBeDefined();
  });

  it("opens query audit trail modal and displays logged query entries", async () => {
    renderWithClient(<SponsorAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("view-audit-log-btn")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("view-audit-log-btn"));

    await waitFor(() => {
      expect(screen.getByText("Sponsor Analytics Query Audit Trail")).toBeDefined();
      expect(screen.getByText("COURT_ANALYTICS")).toBeDefined();
      expect(screen.getByText(/2 buckets suppressed/)).toBeDefined();
    });
  });

  it("displays empty state when user has no active grants", async () => {
    vi.spyOn(apiModule, "api").mockImplementation((url: string) => {
      if (url.includes("/api/v1/sponsors/me")) {
        return Promise.resolve({ profile: mockProfile });
      }
      if (url.includes("/api/v1/sponsors/grants")) {
        return Promise.resolve({ items: [] });
      }
      return Promise.resolve({});
    });

    renderWithClient(<SponsorAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText("No Court Analytics Grants Active")).toBeDefined();
      expect(screen.getByRole("button", { name: "Issue or Request Grant" })).toBeDefined();
    });
  });
});

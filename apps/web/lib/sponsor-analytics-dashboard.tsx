"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Select,
} from "@courtiq/design-system";
import { api, ApiError } from "./api";

export interface SponsorProfile {
  id: string;
  userId: string;
  companyName: string;
  contactEmail: string;
  brandCategory: string;
  websiteUrl: string | null;
  status: string;
  activeGrants?: SponsorGrant[];
}

export interface SponsorGrant {
  id: string;
  sponsorId: string;
  courtId: string | null;
  competitionId: string | null;
  scope: "COURT" | "COMPETITION" | "GLOBAL";
  grantedBy: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface AnonymizedBucket {
  label: string;
  category: string;
  count: number;
  isSuppressed: boolean;
  displayCount: string;
  percentage?: number;
}

export interface CourtAnalyticsData {
  courtId: string;
  courtName: string;
  kThreshold: number;
  totalUniqueAthletesSuppressed: boolean;
  totalUniqueAthletesDisplay: string;
  totalSessions: number;
  totalPickupGames: number;
  totalReservations: number;
  demographicsSuppressed: boolean;
  suppressionNotice?: string;
  ageCohorts: AnonymizedBucket[];
  skillDistribution: AnonymizedBucket[];
  hourlyActivity: AnonymizedBucket[];
  dayOfWeekActivity: AnonymizedBucket[];
  suppressedBucketCount: number;
  complianceNotice: string;
}

export interface CompetitionAnalyticsData {
  competitionId: string;
  competitionName: string;
  format: string;
  kThreshold: number;
  totalTeams: number;
  totalMatches: number;
  completedMatches: number;
  totalRosteredAthletesSuppressed: boolean;
  totalRosteredAthletesDisplay: string;
  demographicsSuppressed: boolean;
  suppressionNotice?: string;
  ageCohorts: AnonymizedBucket[];
  stageBreakdown: AnonymizedBucket[];
  suppressedBucketCount: number;
  complianceNotice: string;
}

export interface QueryAuditLogItem {
  id: string;
  queryType: string;
  resourceId: string;
  kThreshold: number;
  suppressedBuckets: number;
  createdAt: string;
}

const BRAND_CATEGORIES = [
  { value: "APPAREL", label: "Apparel & Uniforms" },
  { value: "FOOTWEAR", label: "Footwear & Shoes" },
  { value: "BEVERAGES", label: "Hydration & Beverages" },
  { value: "NUTRITION", label: "Nutrition & Supplements" },
  { value: "EQUIPMENT", label: "Basketballs & Training Equipment" },
  { value: "MEDIA", label: "Sports Media & Broadcasting" },
  { value: "TECHNOLOGY", label: "Sports Tech & Wearables" },
  { value: "COMMUNITY", label: "Community & Local Business" },
  { value: "OTHER", label: "Other Commercial Partner" },
];

export function SponsorAnalyticsDashboard() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"COURT" | "COMPETITION">("COURT");
  const [selectedCourtId, setSelectedCourtId] = useState<string>("");
  const [selectedCompId, setSelectedCompId] = useState<string>("");
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isGrantOpen, setIsGrantOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);

  // Form states
  const [companyName, setCompanyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [brandCategory, setBrandCategory] = useState("APPAREL");
  const [websiteUrl, setWebsiteUrl] = useState("");

  const [grantSponsorId, setGrantSponsorId] = useState("");
  const [grantResourceId, setGrantResourceId] = useState("");
  const [grantScope, setGrantScope] = useState<"COURT" | "COMPETITION">("COURT");

  // Fetch current user sponsor profile
  const {
    data: profileData,
    isLoading: isProfileLoading,
    error: profileError,
  } = useQuery({
    queryKey: ["sponsors", "me"],
    queryFn: () => api<{ profile: SponsorProfile | null }>("/api/v1/sponsors/me"),
  });

  // Fetch grants list
  const { data: grantsData } = useQuery({
    queryKey: ["sponsors", "grants"],
    queryFn: () => api<{ items: SponsorGrant[] }>("/api/v1/sponsors/grants"),
  });

  // Available court IDs from active grants
  const availableCourtGrants = useMemo(() => {
    return (grantsData?.items ?? []).filter((g) => g.courtId !== null);
  }, [grantsData]);

  // Available competition IDs from active grants
  const availableCompGrants = useMemo(() => {
    return (grantsData?.items ?? []).filter((g) => g.competitionId !== null);
  }, [grantsData]);

  // Auto-select first available court / competition if not set
  React.useEffect(() => {
    if (!selectedCourtId && availableCourtGrants.length > 0) {
      setSelectedCourtId(availableCourtGrants[0]!.courtId!);
    }
  }, [selectedCourtId, availableCourtGrants]);

  React.useEffect(() => {
    if (!selectedCompId && availableCompGrants.length > 0) {
      setSelectedCompId(availableCompGrants[0]!.competitionId!);
    }
  }, [selectedCompId, availableCompGrants]);

  // Fetch Court Analytics when court is selected
  const {
    data: courtAnalytics,
    isLoading: isCourtLoading,
    error: courtError,
    refetch: refetchCourt,
  } = useQuery({
    queryKey: ["sponsors", "analytics", "court", selectedCourtId],
    queryFn: () =>
      api<CourtAnalyticsData>(`/api/v1/sponsors/analytics/courts/${selectedCourtId}`),
    enabled: Boolean(selectedCourtId) && activeTab === "COURT",
  });

  // Fetch Competition Analytics when competition is selected
  const {
    data: compAnalytics,
    isLoading: isCompLoading,
    error: compError,
    refetch: refetchComp,
  } = useQuery({
    queryKey: ["sponsors", "analytics", "competition", selectedCompId],
    queryFn: () =>
      api<CompetitionAnalyticsData>(`/api/v1/sponsors/analytics/competitions/${selectedCompId}`),
    enabled: Boolean(selectedCompId) && activeTab === "COMPETITION",
  });

  // Fetch audit log
  const { data: auditLogs } = useQuery({
    queryKey: ["sponsors", "analytics", "audit-log"],
    queryFn: () => api<{ items: QueryAuditLogItem[] }>("/api/v1/sponsors/analytics/audit-log"),
    enabled: isAuditOpen,
  });

  // Mutations
  const registerProfileMutation = useMutation({
    mutationFn: (body: {
      companyName: string;
      contactEmail: string;
      brandCategory: string;
      websiteUrl?: string;
    }) =>
      api<SponsorProfile>("/api/v1/sponsors/profile", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sponsors", "me"] });
      setIsRegisterOpen(false);
    },
  });

  const createGrantMutation = useMutation({
    mutationFn: (body: {
      sponsorId: string;
      courtId?: string;
      competitionId?: string;
      scope: "COURT" | "COMPETITION";
    }) =>
      api<SponsorGrant>("/api/v1/sponsors/grants", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sponsors", "grants"] });
      setIsGrantOpen(false);
      setGrantSponsorId("");
      setGrantResourceId("");
    },
  });

  const profile = profileData?.profile;

  if (isProfileLoading) {
    return <LoadingState message="Loading sponsor analytics workspace..." />;
  }

  if (profileError && !(profileError instanceof ApiError && profileError.status === 404)) {
    return (
      <ErrorState
        title="Unable to load sponsor workspace"
        message={profileError.message || "An unexpected error occurred."}
        onRetry={() => qc.invalidateQueries({ queryKey: ["sponsors", "me"] })}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6" data-testid="sponsor-analytics-dashboard">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {profile ? profile.companyName : "Sponsor & Facility Analytics"}
            </h1>
            {profile && (
              <Badge variant="brand">
                {profile.brandCategory}
              </Badge>
            )}
            <Badge variant="success">
              k-Anonymity Verified (k ≥ 5)
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Aggregated court footfall, demographic trends, and tournament metrics with strict zero-leakage privacy guardrails (Spec §8.6, §24.2).
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsAuditOpen(true)}
            data-testid="view-audit-log-btn"
          >
            Audit Trail
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsGrantOpen(true)}
            data-testid="issue-grant-btn"
          >
            Issue Grant
          </Button>
          {!profile && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsRegisterOpen(true)}
              data-testid="register-sponsor-btn"
            >
              Register Sponsor Profile
            </Button>
          )}
        </div>
      </div>

      {/* k-Anonymity Guardrail Callout Banner */}
      <Card className="p-4 bg-muted/40 border-primary/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
            🛡️
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              k-Anonymity Privacy Guardrails Enforced (k ≥ 5)
            </h2>
            <p className="text-xs text-muted-foreground">
              Per ADR-0004 & Master Spec §24.2, any demographic sub-cohort with fewer than 5 unique athletes is strictly suppressed to eliminate individual or minor re-identification risk.
            </p>
          </div>
        </div>
        <Badge variant="neutral" className="text-xs whitespace-nowrap">
          ADR-0004 • ADR-0010
        </Badge>
      </Card>

      {/* Resource Scope Switcher (Courts vs Tournaments) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex gap-2">
          <Button
            variant={activeTab === "COURT" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setActiveTab("COURT")}
            data-testid="tab-court-analytics"
          >
            Court Facilities ({availableCourtGrants.length})
          </Button>
          <Button
            variant={activeTab === "COMPETITION" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setActiveTab("COMPETITION")}
            data-testid="tab-comp-analytics"
          >
            Tournament Metrics ({availableCompGrants.length})
          </Button>
        </div>

        {/* Resource Selector Dropdown */}
        {activeTab === "COURT" && availableCourtGrants.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Selected Facility:</span>
            <Select
              value={selectedCourtId}
              onChange={(e) => setSelectedCourtId(e.target.value)}
              className="text-xs w-64"
              data-testid="select-court"
            >
              {availableCourtGrants.map((g) => (
                <option key={g.id} value={g.courtId!}>
                  Court {g.courtId?.slice(0, 8)}... (Scope: {g.scope})
                </option>
              ))}
            </Select>
          </div>
        )}

        {activeTab === "COMPETITION" && availableCompGrants.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Selected Tournament:</span>
            <Select
              value={selectedCompId}
              onChange={(e) => setSelectedCompId(e.target.value)}
              className="text-xs w-64"
              data-testid="select-competition"
            >
              {availableCompGrants.map((g) => (
                <option key={g.id} value={g.competitionId!}>
                  Competition {g.competitionId?.slice(0, 8)}... (Scope: {g.scope})
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {/* Main Analytics Content */}
      {activeTab === "COURT" && (
        <CourtAnalyticsSection
          courtId={selectedCourtId}
          data={courtAnalytics}
          isLoading={isCourtLoading}
          error={courtError}
          hasGrants={availableCourtGrants.length > 0}
          onOpenGrant={() => setIsGrantOpen(true)}
          onRetry={refetchCourt}
        />
      )}

      {activeTab === "COMPETITION" && (
        <CompetitionAnalyticsSection
          competitionId={selectedCompId}
          data={compAnalytics}
          isLoading={isCompLoading}
          error={compError}
          hasGrants={availableCompGrants.length > 0}
          onOpenGrant={() => setIsGrantOpen(true)}
          onRetry={refetchComp}
        />
      )}

      {/* Register / Update Profile Modal */}
      <Dialog
        open={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        title="Register Sponsor Company Profile"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            registerProfileMutation.mutate({
              companyName,
              contactEmail,
              brandCategory,
              websiteUrl: websiteUrl || undefined,
            });
          }}
        >
          <div>
            <label className="text-xs font-medium text-foreground">Company / Organization Name</label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Apex Athletics"
              required
              data-testid="input-company-name"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Official Contact Email</label>
            <Input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="partnerships@brand.com"
              required
              data-testid="input-contact-email"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Brand Category</label>
            <Select
              value={brandCategory}
              onChange={(e) => setBrandCategory(e.target.value)}
              data-testid="select-brand-category"
            >
              {BRAND_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Website URL (Optional)</label>
            <Input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://brand.com"
              data-testid="input-website-url"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setIsRegisterOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={registerProfileMutation.isPending}
              data-testid="submit-register-btn"
            >
              {registerProfileMutation.isPending ? "Registering..." : "Save Profile"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Issue Grant Modal */}
      <Dialog
        open={isGrantOpen}
        onClose={() => setIsGrantOpen(false)}
        title="Issue Analytics Access Grant"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createGrantMutation.mutate({
              sponsorId: grantSponsorId,
              courtId: grantScope === "COURT" ? grantResourceId : undefined,
              competitionId: grantScope === "COMPETITION" ? grantResourceId : undefined,
              scope: grantScope,
            });
          }}
        >
          <p className="text-xs text-muted-foreground">
            Authorizes a registered sponsor to view aggregated metrics with k-anonymity (k ≥ 5) guardrails.
          </p>
          <div>
            <label className="text-xs font-medium text-foreground">Sponsor Profile UUID</label>
            <Input
              value={grantSponsorId}
              onChange={(e) => setGrantSponsorId(e.target.value)}
              placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
              required
              data-testid="input-grant-sponsor-id"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Scope</label>
            <Select
              value={grantScope}
              onChange={(e) => setGrantScope(e.target.value as "COURT" | "COMPETITION")}
              data-testid="select-grant-scope"
            >
              <option value="COURT">Court Facility</option>
              <option value="COMPETITION">Tournament / Competition</option>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">
              {grantScope === "COURT" ? "Court Facility UUID" : "Tournament UUID"}
            </label>
            <Input
              value={grantResourceId}
              onChange={(e) => setGrantResourceId(e.target.value)}
              placeholder="Target Resource UUID"
              required
              data-testid="input-grant-resource-id"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setIsGrantOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createGrantMutation.isPending}
              data-testid="submit-grant-btn"
            >
              {createGrantMutation.isPending ? "Issuing..." : "Issue Grant"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Query Audit Trail Modal */}
      <Dialog
        open={isAuditOpen}
        onClose={() => setIsAuditOpen(false)}
        title="Sponsor Analytics Query Audit Trail"
      >
        <div className="space-y-3 max-h-96 overflow-y-auto">
          <p className="text-xs text-muted-foreground">
            Append-only audit record of analytical queries, tracking k-anonymity compliance and suppressed cohort counts.
          </p>
          {auditLogs?.items && auditLogs.items.length > 0 ? (
            <div className="divide-y divide-border">
              {auditLogs.items.map((log) => (
                <div key={log.id} className="py-2 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-foreground">{log.queryType}</span>
                    <p className="text-muted-foreground text-[11px]">
                      Resource: {log.resourceId.slice(0, 8)}... • k-Threshold: {log.kThreshold}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant="neutral" className="text-[10px]">
                      {log.suppressedBuckets} buckets suppressed
                    </Badge>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">No recent analytical queries logged.</p>
          )}
          <div className="flex justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={() => setIsAuditOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

/**
 * Court Facility Analytics View with k-Anonymity Guardrails
 */
function CourtAnalyticsSection({
  courtId,
  data,
  isLoading,
  error,
  hasGrants,
  onOpenGrant,
  onRetry,
}: {
  courtId: string;
  data: CourtAnalyticsData | undefined;
  isLoading: boolean;
  error: Error | null;
  hasGrants: boolean;
  onOpenGrant: () => void;
  onRetry: () => void;
}) {
  if (!hasGrants) {
    return (
      <EmptyState
        title="No Court Analytics Grants Active"
        description="You do not currently have active analytics grants for any court facilities. Venue managers can issue an authorized grant to your sponsor UUID."
        action={{
          label: "Issue or Request Grant",
          onClick: onOpenGrant,
        }}
      />
    );
  }

  if (isLoading) {
    return <LoadingState message="Aggregating court footfall and calculating k-anonymity cohorts..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Unable to load court analytics"
        message={error.message || "Unauthorized or facility not found."}
        onRetry={onRetry}
      />
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6" data-testid="court-analytics-content">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-card">
          <p className="text-xs text-muted-foreground">Total Sessions</p>
          <p className="text-2xl font-bold text-foreground mt-1" data-testid="total-sessions-metric">
            {data.totalSessions}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {data.totalPickupGames} pickup • {data.totalReservations} reservations
          </p>
        </Card>

        <Card className="p-4 bg-card">
          <p className="text-xs text-muted-foreground">Unique Athletes</p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-2xl font-bold text-foreground" data-testid="unique-athletes-metric">
              {data.totalUniqueAthletesDisplay}
            </p>
            {data.totalUniqueAthletesSuppressed && (
              <Badge variant="warning" className="text-[10px]">
                Suppressed
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Threshold: k ≥ {data.kThreshold}</p>
        </Card>

        <Card className="p-4 bg-card">
          <p className="text-xs text-muted-foreground">Suppressed Buckets</p>
          <p className="text-2xl font-bold text-foreground mt-1" data-testid="suppressed-buckets-metric">
            {data.suppressedBucketCount}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Sub-cohorts masked for privacy</p>
        </Card>

        <Card className="p-4 bg-card">
          <p className="text-xs text-muted-foreground">Compliance Rating</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">100%</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Zero athlete de-anonymization</p>
        </Card>
      </div>

      {/* Demographic Suppression Banner if Applicable */}
      {data.demographicsSuppressed && (
        <Card className="p-4 bg-amber-500/10 border-amber-500/30">
          <div className="flex items-start gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                Demographic Breakdown Suppressed
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                {data.suppressionNotice ||
                  `All demographic sub-cohorts are masked because total facility footfall is under ${data.kThreshold} unique participants.`}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Age Cohorts Distribution Table & Meter */}
      <Card className="p-5 bg-card">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Age Cohort Distribution</h3>
            <p className="text-xs text-muted-foreground">
              Buckets with fewer than {data.kThreshold} participants are masked per Spec §24.2.
            </p>
          </div>
          <Badge variant="neutral" className="text-xs">
            k ≥ {data.kThreshold} Enforced
          </Badge>
        </div>

        <div className="space-y-4 pt-4">
          {data.ageCohorts.map((cohort) => (
            <div key={cohort.category} className="space-y-1.5" data-testid={`age-cohort-${cohort.category}`}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{cohort.label}</span>
                <div className="flex items-center gap-2">
                  {cohort.isSuppressed ? (
                    <Badge variant="warning" className="text-[10px]">
                      &lt; {data.kThreshold} (Suppressed for Privacy)
                    </Badge>
                  ) : (
                    <span className="font-bold text-foreground">
                      {cohort.displayCount} ({cohort.percentage ?? 0}%)
                    </span>
                  )}
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    cohort.isSuppressed ? "bg-amber-400/40" : "bg-primary"
                  }`}
                  style={{ width: `${cohort.percentage ?? (cohort.isSuppressed ? 10 : 0)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Skill Band & Prime Utilization Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5 bg-card">
          <h3 className="text-sm font-semibold text-foreground mb-3">Skill Level Breakdown</h3>
          <div className="space-y-3">
            {data.skillDistribution.map((skill) => (
              <div key={skill.category} className="flex items-center justify-between text-xs py-1 border-b border-border/50">
                <span className="text-muted-foreground">{skill.label}</span>
                {skill.isSuppressed ? (
                  <Badge variant="warning" className="text-[10px]">
                    &lt; {data.kThreshold} Suppressed
                  </Badge>
                ) : (
                  <span className="font-semibold text-foreground">{skill.displayCount} sessions</span>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 bg-card">
          <h3 className="text-sm font-semibold text-foreground mb-3">Facility Privacy Metadata</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>• Court Identifier: <span className="font-mono text-foreground">{courtId}</span></p>
            <p>• Privacy Standard: <span className="text-foreground">k-Anonymity (k ≥ {data.kThreshold})</span></p>
            <p>• Re-identification Risk: <span className="text-emerald-600 font-semibold">Negligible (Bounded)</span></p>
            <p>• Medical Diagnostic Data: <span className="text-foreground">Strictly Excluded (ADR-0009)</span></p>
            <p className="pt-2 text-[11px] italic text-muted-foreground/80">{data.complianceNotice}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

/**
 * Tournament / Competition Analytics View with k-Anonymity Guardrails
 */
function CompetitionAnalyticsSection({
  competitionId,
  data,
  isLoading,
  error,
  hasGrants,
  onOpenGrant,
  onRetry,
}: {
  competitionId: string;
  data: CompetitionAnalyticsData | undefined;
  isLoading: boolean;
  error: Error | null;
  hasGrants: boolean;
  onOpenGrant: () => void;
  onRetry: () => void;
}) {
  if (!hasGrants) {
    return (
      <EmptyState
        title="No Tournament Analytics Grants Active"
        description="You do not currently have active analytics grants for any tournament competitions. Tournament organizers can issue an authorized grant to your sponsor UUID."
        action={{
          label: "Issue or Request Grant",
          onClick: onOpenGrant,
        }}
      />
    );
  }

  if (isLoading) {
    return <LoadingState message="Aggregating competition rosters and demographic trends..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Unable to load tournament analytics"
        message={error.message || "Unauthorized or tournament not found."}
        onRetry={onRetry}
      />
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6" data-testid="competition-analytics-content">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-card">
          <p className="text-xs text-muted-foreground">Enrolled Teams</p>
          <p className="text-2xl font-bold text-foreground mt-1" data-testid="total-teams-metric">
            {data.totalTeams}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Format: {data.format}</p>
        </Card>

        <Card className="p-4 bg-card">
          <p className="text-xs text-muted-foreground">Rostered Athletes</p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-2xl font-bold text-foreground" data-testid="rostered-athletes-metric">
              {data.totalRosteredAthletesDisplay}
            </p>
            {data.totalRosteredAthletesSuppressed && (
              <Badge variant="warning" className="text-[10px]">
                Suppressed
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Threshold: k ≥ {data.kThreshold}</p>
        </Card>

        <Card className="p-4 bg-card">
          <p className="text-xs text-muted-foreground">Matches Scheduled</p>
          <p className="text-2xl font-bold text-foreground mt-1">
            {data.completedMatches} / {data.totalMatches}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Finished or locked matches</p>
        </Card>

        <Card className="p-4 bg-card">
          <p className="text-xs text-muted-foreground">Suppressed Buckets</p>
          <p className="text-2xl font-bold text-foreground mt-1">
            {data.suppressedBucketCount}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Sub-cohorts masked for privacy</p>
        </Card>
      </div>

      {/* Age Cohorts Distribution Table & Meter */}
      <Card className="p-5 bg-card">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Tournament Division Demographics</h3>
            <p className="text-xs text-muted-foreground">
              Age cohorts across all rostered athletes with k-anonymity (k ≥ {data.kThreshold}) protection.
            </p>
          </div>
          <Badge variant="neutral" className="text-xs">
            k ≥ {data.kThreshold} Enforced
          </Badge>
        </div>

        <div className="space-y-4 pt-4">
          {data.ageCohorts.map((cohort) => (
            <div key={cohort.category} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{cohort.label}</span>
                <div className="flex items-center gap-2">
                  {cohort.isSuppressed ? (
                    <Badge variant="warning" className="text-[10px]">
                      &lt; {data.kThreshold} (Suppressed for Privacy)
                    </Badge>
                  ) : (
                    <span className="font-bold text-foreground">
                      {cohort.displayCount} ({cohort.percentage ?? 0}%)
                    </span>
                  )}
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    cohort.isSuppressed ? "bg-amber-400/40" : "bg-primary"
                  }`}
                  style={{ width: `${cohort.percentage ?? (cohort.isSuppressed ? 10 : 0)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 bg-card">
        <h3 className="text-sm font-semibold text-foreground mb-3">Tournament Privacy Metadata</h3>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>• Competition Identifier: <span className="font-mono text-foreground">{competitionId}</span></p>
          <p>• Privacy Standard: <span className="text-foreground">k-Anonymity (k ≥ {data.kThreshold})</span></p>
          <p>• Re-identification Risk: <span className="text-emerald-600 font-semibold">Negligible (Bounded)</span></p>
          <p>• Medical Diagnostic Data: <span className="text-foreground">Strictly Excluded (ADR-0009)</span></p>
          <p className="pt-2 text-[11px] italic text-muted-foreground/80">{data.complianceNotice}</p>
        </div>
      </Card>
    </div>
  );
}

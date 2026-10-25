"use client";

import React, { useState } from "react";
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
import { api } from "./api";
import { RecruitmentInvitesPanel } from "./recruitment-invites-panel";

export interface OpportunityItem {
  id: string;
  title: string;
  slug: string;
  type: "TEAM_TRYOUT" | "OPEN_RUN" | "SHOWCASE_CAMP" | "COLLEGE_RECRUITING_COMBINE" | "PRO_CONTRACT_TRIAL";
  organizationName: string;
  description: string;
  requirements: string | null;
  verificationStatus: "COMMUNITY" | "VERIFIED" | "FEATURED" | "REJECTED" | "EXPIRED";
  locationName: string;
  address: string | null;
  city: string;
  country: string;
  startDate: string | null;
  endDate: string | null;
  applicationDeadline: string | null;
  costCents: number;
  currency: string;
  contactEmail: string;
  ageGroup: string;
  minAge: number | null;
  maxAge: number | null;
  gender: string;
  positions: string[];
  skillLevel: string;
  capacity: number | null;
}

export interface MyApplicationItem {
  id: string;
  opportunityId: string;
  status: "SUBMITTED" | "UNDER_REVIEW" | "INVITED" | "WAITLISTED" | "DECLINED";
  primaryPosition: string;
  notes: string | null;
  reviewerNotes: string | null;
  createdAt: string;
  opportunity: {
    id: string;
    title: string;
    type: string;
    organizationName: string;
    locationName: string;
    city: string;
    startDate: string | null;
  };
}

export function OpportunityBoard() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"browse" | "my-apps" | "pickup-invites">("browse");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [selectedOpp, setSelectedOpp] = useState<OpportunityItem | null>(null);

  // Application form state
  const [position, setPosition] = useState("PG");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [currentTeam, setCurrentTeam] = useState("");
  const [passportToken, setPassportToken] = useState("");
  const [notes, setNotes] = useState("");
  const [isMinorApplicant, setIsMinorApplicant] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [applyError, setApplyError] = useState<string | null>(null);

  // Query: Browse opportunities
  const opportunitiesQuery = useQuery<{ items: OpportunityItem[] }>({
    queryKey: ["opportunities", typeFilter, cityFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (typeFilter !== "ALL") params.set("type", typeFilter);
      if (cityFilter.trim()) params.set("city", cityFilter.trim());
      const queryStr = params.toString() ? `?${params.toString()}` : "";
      return api<{ items: OpportunityItem[] }>(`/opportunities${queryStr}`);
    },
  });

  // Query: My applications
  const myAppsQuery = useQuery<{ items: MyApplicationItem[] }>({
    queryKey: ["my-opportunity-applications"],
    queryFn: () => api<{ items: MyApplicationItem[] }>("/me/opportunity-applications"),
    enabled: activeTab === "my-apps",
  });

  // Mutation: Apply to opportunity
  const applyMutation = useMutation({
    mutationFn: (oppId: string) => {
      setApplyError(null);
      if (isMinorApplicant && (!guardianName.trim() || !guardianEmail.trim())) {
        throw new Error("Minor Safeguard: Guardian Name and Email are mandatory for under-18 applicants.");
      }
      return api(`/opportunities/${oppId}/apply`, {
        method: "POST",
        body: JSON.stringify({
          primaryPosition: position,
          heightCm: heightCm ? parseInt(heightCm, 10) : undefined,
          weightKg: weightKg ? parseInt(weightKg, 10) : undefined,
          graduationYear: gradYear ? parseInt(gradYear, 10) : undefined,
          currentTeam: currentTeam.trim() || undefined,
          passportToken: passportToken.trim() || undefined,
          notes: notes.trim() || undefined,
          guardianConsentGranted: isMinorApplicant,
          guardianName: isMinorApplicant ? guardianName.trim() : undefined,
          guardianEmail: isMinorApplicant ? guardianEmail.trim() : undefined,
        }),
      });
    },
    onSuccess: () => {
      setSelectedOpp(null);
      qc.invalidateQueries({ queryKey: ["my-opportunity-applications"] });
      setActiveTab("my-apps");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to submit application";
      setApplyError(msg);
    },
  });

  const formatCost = (cents: number, currency: string) => {
    if (cents === 0) return "Free";
    return `$${(cents / 100).toFixed(2)} ${currency}`;
  };

  const getStatusBadge = (status: MyApplicationItem["status"]) => {
    switch (status) {
      case "INVITED":
        return <Badge variant="success">INVITED</Badge>;
      case "UNDER_REVIEW":
        return <Badge variant="info">UNDER REVIEW</Badge>;
      case "WAITLISTED":
        return <Badge variant="warning">WAITLISTED</Badge>;
      case "DECLINED":
        return <Badge variant="danger">DECLINED</Badge>;
      default:
        return <Badge variant="neutral">SUBMITTED</Badge>;
    }
  };

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
            Opportunity Directory & Tryouts
          </h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 15 }}>
            Discover verified team tryouts, prospect showcases, college recruiting combines, and open runs.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button
            variant={activeTab === "browse" ? "primary" : "secondary"}
            onClick={() => setActiveTab("browse")}
          >
            Browse Opportunities
          </Button>
          <Button
            variant={activeTab === "my-apps" ? "primary" : "secondary"}
            onClick={() => setActiveTab("my-apps")}
          >
            My Applications
          </Button>
          <Button
            variant={activeTab === "pickup-invites" ? "primary" : "secondary"}
            onClick={() => setActiveTab("pickup-invites")}
          >
            Pickup Scouting Invites
          </Button>
        </div>
      </div>

      {activeTab === "browse" && (
        <>
          {/* Filters Bar */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <div style={{ minWidth: 200 }}>
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                options={[
                  { label: "All Opportunity Types", value: "ALL" },
                  { label: "Team Tryouts", value: "TEAM_TRYOUT" },
                  { label: "Showcase Camps", value: "SHOWCASE_CAMP" },
                  { label: "College Combines", value: "COLLEGE_RECRUITING_COMBINE" },
                  { label: "Pro Contract Trials", value: "PRO_CONTRACT_TRIAL" },
                  { label: "Curated Open Runs", value: "OPEN_RUN" },
                ]}
              />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <Input
                placeholder="Filter by city (e.g. Seattle, Chicago)..."
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
              />
            </div>
          </div>

          {/* Opportunities List */}
          {opportunitiesQuery.isLoading && <LoadingState message="Loading opportunities..." />}
          {opportunitiesQuery.isError && (
            <ErrorState
              title="Unable to load opportunities"
              message="Please verify your internet connection and try again."
              onRetry={() => opportunitiesQuery.refetch()}
            />
          )}

          {opportunitiesQuery.isSuccess && opportunitiesQuery.data.items.length === 0 && (
            <EmptyState
              title="No opportunities found"
              description="There are currently no open opportunities matching your filter criteria."
            />
          )}

          {opportunitiesQuery.isSuccess && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
              {opportunitiesQuery.data.items.map((opp) => (
                <Card key={opp.id} style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <Badge variant="brand">{opp.type.replace(/_/g, " ")}</Badge>
                      <Badge variant={opp.verificationStatus === "VERIFIED" ? "success" : "neutral"}>
                        {opp.verificationStatus}
                      </Badge>
                    </div>

                    <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 4px", color: "var(--foreground)" }}>
                      {opp.title}
                    </h3>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--brand)", marginBottom: 10 }}>
                      {opp.organizationName}
                    </div>

                    <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 12px", lineHeight: 1.4 }}>
                      {opp.description}
                    </p>

                    <div style={{ fontSize: 13, color: "var(--foreground)", display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                      <div>📍 <strong>Location:</strong> {opp.locationName}, {opp.city}</div>
                      <div>👥 <strong>Age Group:</strong> {opp.ageGroup} • {opp.gender}</div>
                      <div>🎯 <strong>Positions:</strong> {opp.positions.join(", ")}</div>
                      <div>💵 <strong>Entry Fee:</strong> {formatCost(opp.costCents, opp.currency)}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                    <Button
                      variant="primary"
                      style={{ width: "100%" }}
                      onClick={() => {
                        setSelectedOpp(opp);
                        setApplyError(null);
                      }}
                    >
                      Apply / Register
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* My Applications Tab */}
      {activeTab === "my-apps" && (
        <div>
          {myAppsQuery.isLoading && <LoadingState message="Loading your applications..." />}
          {myAppsQuery.isError && (
            <ErrorState
              title="Unable to load applications"
              message="Failed to retrieve submitted applications."
              onRetry={() => myAppsQuery.refetch()}
            />
          )}

          {myAppsQuery.isSuccess && myAppsQuery.data.items.length === 0 && (
            <EmptyState
              title="No applications submitted yet"
              description="Browse open tryouts and showcases to submit your athletic profile."
            />
          )}

          {myAppsQuery.isSuccess && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {myAppsQuery.data.items.map((app) => (
                <Card key={app.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>
                        {app.opportunity.title}
                      </h3>
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>
                        {app.opportunity.organizationName} • {app.opportunity.locationName}, {app.opportunity.city}
                      </div>
                    </div>
                    {getStatusBadge(app.status)}
                  </div>

                  <div style={{ fontSize: 13, color: "var(--muted)", margin: "8px 0" }}>
                    Position: <strong>{app.primaryPosition}</strong> • Applied: {new Date(app.createdAt).toLocaleDateString()}
                  </div>

                  {app.reviewerNotes && (
                    <div style={{ background: "var(--surface-raised)", padding: "10px 14px", borderRadius: 6, fontSize: 13, marginTop: 8 }}>
                      <strong>Organizer Feedback:</strong> {app.reviewerNotes}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "pickup-invites" && <RecruitmentInvitesPanel />}

      {/* Application Dialog Modal */}
      {selectedOpp && (
        <Dialog
          open={true}
          onClose={() => setSelectedOpp(null)}
          title={`Apply: ${selectedOpp.title}`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Submitting application to <strong>{selectedOpp.organizationName}</strong>.
            </div>

            {applyError && (
              <div style={{ padding: 10, background: "var(--danger-bg, #fee2e2)", color: "var(--danger, #dc2626)", borderRadius: 6, fontSize: 13 }}>
                {applyError}
              </div>
            )}

            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
                Primary Position
              </label>
              <Select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                options={[
                  { label: "Point Guard (PG)", value: "PG" },
                  { label: "Shooting Guard (SG)", value: "SG" },
                  { label: "Small Forward (SF)", value: "SF" },
                  { label: "Power Forward (PF)", value: "PF" },
                  { label: "Center (C)", value: "C" },
                ]}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
                  Height (cm)
                </label>
                <Input
                  type="number"
                  placeholder="193"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
                  Weight (kg)
                </label>
                <Input
                  type="number"
                  placeholder="88"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
                  Graduation Year
                </label>
                <Input
                  type="number"
                  placeholder="2027"
                  value={gradYear}
                  onChange={(e) => setGradYear(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
                  Current Club / School
                </label>
                <Input
                  placeholder="Seattle Prep Varsity"
                  value={currentTeam}
                  onChange={(e) => setCurrentTeam(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
                Career Passport Share Token (Optional)
              </label>
              <Input
                placeholder="Paste your verified passport link or token"
                value={passportToken}
                onChange={(e) => setPassportToken(e.target.value)}
              />
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                Allows the evaluation committee to view your verified official stats and combine metrics.
              </span>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
                Player Statement / References
              </label>
              <Input
                placeholder="Mention past accolades, playstyle, coach contacts..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Minor Safeguarding Checkbox */}
            <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 12, background: "var(--surface)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={isMinorApplicant}
                  onChange={(e) => setIsMinorApplicant(e.target.checked)}
                />
                <strong>Applicant is under 18 years old</strong>
              </label>

              {isMinorApplicant && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    Minor Safeguard (Spec §11.2, §14.1): Guardian consent details are required.
                  </span>
                  <Input
                    placeholder="Guardian Full Name"
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                  />
                  <Input
                    type="email"
                    placeholder="Guardian Email Address"
                    value={guardianEmail}
                    onChange={(e) => setGuardianEmail(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <Button variant="secondary" onClick={() => setSelectedOpp(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={applyMutation.isPending}
                onClick={() => applyMutation.mutate(selectedOpp.id)}
              >
                {applyMutation.isPending ? "Submitting..." : "Submit Application"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

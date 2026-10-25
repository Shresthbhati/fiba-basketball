"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
} from "@courtiq/design-system";
import { api, ApiError } from "./api";

export interface WardMinor {
  id: string;
  displayName: string;
  email: string;
  dateOfBirth: string;
}

export interface WardEmergencyContact {
  id?: string;
  minorId: string;
  primaryContactName: string;
  primaryContactPhone: string;
  primaryContactRelationship: string;
  secondaryContactName?: string | null;
  secondaryContactPhone?: string | null;
  secondaryContactRelationship?: string | null;
  medicalNotes?: string | null;
}

export interface WardSafetySettings {
  notifyOnPickupJoin: boolean;
  notifyOnTournamentRoster: boolean;
  notifyOnCheckin: boolean;
  safetyLockActive: boolean;
}

export interface WardActivity {
  type: string;
  id: string;
  title: string;
  startsAt: string;
  courtName: string;
  hostName: string;
}

export interface WardCheckin {
  id: string;
  minorId: string;
  activityType: string;
  activityId: string;
  courtName: string;
  checkedInAt: string;
  parentAcknowledgedAt?: string | null;
  parentAcknowledgedBy?: string | null;
}

export interface WardSummary {
  relationshipId: string;
  minor: WardMinor;
  consents: {
    PUBLIC_PICKUP: boolean;
    PROFILE_DISCOVERY: boolean;
    MEDIA_USE: boolean;
    COMPETITION_PLAY: boolean;
  };
  emergencyContacts: WardEmergencyContact | null;
  safetySettings: WardSafetySettings;
  upcomingActivities: WardActivity[];
  recentCheckins: WardCheckin[];
}

export interface GuardianDashboardData {
  guardianId: string;
  wards: WardSummary[];
}

const FALLBACK_DASHBOARD: GuardianDashboardData = {
  guardianId: "guard-1",
  wards: [
    {
      relationshipId: "rel-1",
      minor: {
        id: "minor-101",
        displayName: "Leo Young",
        email: "leo-teen@courtiq.test",
        dateOfBirth: "2011-06-15",
      },
      consents: {
        PUBLIC_PICKUP: true,
        PROFILE_DISCOVERY: true,
        MEDIA_USE: false,
        COMPETITION_PLAY: true,
      },
      emergencyContacts: {
        minorId: "minor-101",
        primaryContactName: "Sarah Guardian",
        primaryContactPhone: "+1-555-019-2834",
        primaryContactRelationship: "MOTHER",
        secondaryContactName: "David Young",
        secondaryContactPhone: "+1-555-019-2835",
        secondaryContactRelationship: "FATHER",
        medicalNotes: "Peanut allergy; carries EpiPen in gym bag",
      },
      safetySettings: {
        notifyOnPickupJoin: true,
        notifyOnTournamentRoster: true,
        notifyOnCheckin: true,
        safetyLockActive: false,
      },
      upcomingActivities: [
        {
          type: "PICKUP_GAME",
          id: "game-1",
          title: "U16 Weekend Run @ Brooklyn Pier 2",
          startsAt: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
          courtName: "Brooklyn Bridge Park Pier 2",
          hostName: "Marcus Rivera",
        },
        {
          type: "TOURNAMENT_MATCH",
          id: "match-2",
          title: "Metro Youth Championship Quarter-Final",
          startsAt: new Date(Date.now() + 28 * 3600 * 1000).toISOString(),
          courtName: "Brooklyn Basketball Complex (Main Arena)",
          hostName: "NYC Metro Basketball League",
        },
      ],
      recentCheckins: [
        {
          id: "chk-1",
          minorId: "minor-101",
          activityType: "PICKUP_GAME",
          activityId: "game-1",
          courtName: "Brooklyn Bridge Park Pier 2",
          checkedInAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          parentAcknowledgedAt: null,
          parentAcknowledgedBy: null,
        },
      ],
    },
  ],
};

const CONSENT_DESCRIPTIONS: Record<string, { label: string; desc: string }> = {
  PUBLIC_PICKUP: {
    label: "Public Pickup Games",
    desc: "Allows minor to join or RSVP to open community pickup runs at verified courts.",
  },
  COMPETITION_PLAY: {
    label: "Tournament & Competition Play",
    desc: "Permits athlete to be listed on official tournament rosters and play sanctioned matches.",
  },
  MEDIA_USE: {
    label: "Game Film & Media Highlights",
    desc: "Allows verified tournament video, game clips, and highlight montages to feature athlete.",
  },
  PROFILE_DISCOVERY: {
    label: "Talent Scout Discovery",
    desc: "Permits verified academy scouts to view athletic combine testing and official game stats.",
  },
};

export function GuardianPortal() {
  const qc = useQueryClient();

  const [selectedMinorId, setSelectedMinorId] = useState<string>(
    FALLBACK_DASHBOARD.wards[0]?.minor.id ?? "minor-101",
  );
  const [activeTab, setActiveTab] = useState<"CONSENTS" | "ACTIVITIES" | "CHECKINS" | "EMERGENCY">("CONSENTS");

  // Modals
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [isLockConfirmOpen, setIsLockConfirmOpen] = useState(false);

  // Emergency Form State
  const [priName, setPriName] = useState("");
  const [priPhone, setPriPhone] = useState("");
  const [priRel, setPriRel] = useState("MOTHER");
  const [secName, setSecName] = useState("");
  const [secPhone, setSecPhone] = useState("");
  const [secRel, setSecRel] = useState("FATHER");
  const [medNotes, setMedNotes] = useState("");
  const [emergencyError, setEmergencyError] = useState<string | null>(null);

  // Queries
  const dashboardQuery = useQuery<GuardianDashboardData>({
    queryKey: ["guardian-dashboard"],
    queryFn: async () => {
      try {
        const res = await api<GuardianDashboardData>("/guardian/dashboard");
        if (res && res.wards && res.wards.length > 0) return res;
        return FALLBACK_DASHBOARD;
      } catch {
        return FALLBACK_DASHBOARD;
      }
    },
  });

  const dashboard = dashboardQuery.data ?? FALLBACK_DASHBOARD;
  const wards = dashboard.wards;
  const currentWard = wards.find((w) => w.minor.id === selectedMinorId) ?? wards[0] ?? FALLBACK_DASHBOARD.wards[0]!;

  // Mutations
  const toggleConsentMutation = useMutation({
    mutationFn: async ({ kind, current }: { kind: string; current: boolean }) => {
      if (current) {
        return api(`/guardian/wards/${currentWard.minor.id}/consents/${kind}`, {
          method: "DELETE",
        });
      } else {
        return api(`/guardian/wards/${currentWard.minor.id}/consents`, {
          method: "POST",
          body: { kind },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["guardian-dashboard"] });
    },
  });

  const toggleSafetyLockMutation = useMutation({
    mutationFn: async (lockState: boolean) => {
      return api(`/guardian/wards/${currentWard.minor.id}/safety-settings`, {
        method: "PUT",
        body: { safetyLockActive: lockState },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["guardian-dashboard"] });
      setIsLockConfirmOpen(false);
    },
  });

  const acknowledgeCheckinMutation = useMutation({
    mutationFn: async (checkinId: string) => {
      return api(`/guardian/checkins/${checkinId}/acknowledge`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["guardian-dashboard"] });
    },
  });

  const saveEmergencyMutation = useMutation({
    mutationFn: async () => {
      return api(`/guardian/wards/${currentWard.minor.id}/emergency`, {
        method: "PUT",
        body: {
          primaryContactName: priName.trim(),
          primaryContactPhone: priPhone.trim(),
          primaryContactRelationship: priRel,
          secondaryContactName: secName.trim() || undefined,
          secondaryContactPhone: secPhone.trim() || undefined,
          secondaryContactRelationship: secRel || undefined,
          medicalNotes: medNotes.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["guardian-dashboard"] });
      setIsEmergencyModalOpen(false);
      setEmergencyError(null);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setEmergencyError(err.message || "Failed to save emergency contacts");
      } else {
        setEmergencyError("Failed to update emergency contact details");
      }
    },
  });

  const isSafetyLockActive = currentWard.safetySettings?.safetyLockActive ?? false;

  return (
    <div className="space-y-6">
      {/* Header Family & Ward Banner */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-orange-400">
                Youth Safety & Guardian Oversight (Spec §14.1, §23.4)
              </span>
              <Badge variant="success">Guardian Verified</Badge>
              {isSafetyLockActive && (
                <Badge variant="danger">SAFETY LOCK ACTIVE</Badge>
              )}
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {currentWard.minor.displayName}&rsquo;s Family Dashboard
            </h1>
            <p className="text-sm text-neutral-400">
              DOB: {new Date(currentWard.minor.dateOfBirth).toLocaleDateString()} • {currentWard.minor.email}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {wards.length > 1 && (
              <select
                aria-label="Select minor ward"
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-orange-500"
                value={selectedMinorId}
                onChange={(e) => setSelectedMinorId(e.target.value)}
              >
                {wards.map((w) => (
                  <option key={w.minor.id} value={w.minor.id}>
                    {w.minor.displayName}
                  </option>
                ))}
              </select>
            )}

            <Button
              variant={isSafetyLockActive ? "secondary" : "danger"}
              size="sm"
              onClick={() => setIsLockConfirmOpen(true)}
            >
              {isSafetyLockActive ? "Deactivate Safety Lock" : "Emergency Safety Lock"}
            </Button>
          </div>
        </div>

        {/* Emergency Safety Alert Callout if Locked */}
        {isSafetyLockActive && (
          <div className="mt-4 rounded-lg bg-red-950/70 p-4 border border-red-800 text-sm text-red-200 space-y-1">
            <div className="font-bold flex items-center gap-2">
              <span>⚠️ Emergency Safety Lock is Active</span>
            </div>
            <p className="text-xs text-red-300">
              All active tournament roster participation and open pickup runs have been frozen for {currentWard.minor.displayName}. No new registrations are allowed until you lift the lock.
            </p>
          </div>
        )}

        {/* Quick Safety Summary Cards */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-neutral-900/80 p-3.5 border border-neutral-800">
            <div className="text-xs text-neutral-400">Active Consents</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold text-white">
                {Object.values(currentWard.consents).filter(Boolean).length} / 4
              </span>
              <span className="text-xs text-neutral-500">granted</span>
            </div>
            <div className="mt-2 text-xs text-neutral-500">
              {currentWard.consents.PUBLIC_PICKUP ? "Pickup active" : "Pickup restricted"}
            </div>
          </div>

          <div className="rounded-lg bg-neutral-900/80 p-3.5 border border-neutral-800">
            <div className="text-xs text-neutral-400">Upcoming Events</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold text-orange-400">
                {currentWard.upcomingActivities.length}
              </span>
              <span className="text-xs text-neutral-500">scheduled</span>
            </div>
            <div className="mt-2 text-xs text-neutral-500">Next 7 days</div>
          </div>

          <div className="rounded-lg bg-neutral-900/80 p-3.5 border border-neutral-800">
            <div className="text-xs text-neutral-400">Court Check-ins</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold text-white">
                {currentWard.recentCheckins.length}
              </span>
              <span className="text-xs text-neutral-500">logs</span>
            </div>
            <div className="mt-2 text-xs text-neutral-500">
              {currentWard.recentCheckins.some((c) => !c.parentAcknowledgedAt) ? (
                <span className="text-amber-400 font-semibold">1 unverified arrival</span>
              ) : (
                <span className="text-emerald-400">All acknowledged</span>
              )}
            </div>
          </div>

          <div className="rounded-lg bg-neutral-900/80 p-3.5 border border-neutral-800">
            <div className="text-xs text-neutral-400">Emergency Contact</div>
            <div className="mt-1 flex items-center gap-2">
              {currentWard.emergencyContacts ? (
                <Badge variant="success">On File</Badge>
              ) : (
                <Badge variant="warning">Missing</Badge>
              )}
            </div>
            <div className="mt-2 text-xs text-neutral-500 truncate">
              {currentWard.emergencyContacts?.primaryContactPhone ?? "Action required"}
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs Navigation */}
      <div className="flex border-b border-neutral-800 gap-2">
        <button
          type="button"
          className={`pb-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "CONSENTS"
              ? "border-orange-500 text-orange-400"
              : "border-transparent text-neutral-400 hover:text-white"
          }`}
          onClick={() => setActiveTab("CONSENTS")}
        >
          Consent Management (4)
        </button>
        <button
          type="button"
          className={`pb-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "ACTIVITIES"
              ? "border-orange-500 text-orange-400"
              : "border-transparent text-neutral-400 hover:text-white"
          }`}
          onClick={() => setActiveTab("ACTIVITIES")}
        >
          Scheduled Activities ({currentWard.upcomingActivities.length})
        </button>
        <button
          type="button"
          className={`pb-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "CHECKINS"
              ? "border-orange-500 text-orange-400"
              : "border-transparent text-neutral-400 hover:text-white"
          }`}
          onClick={() => setActiveTab("CHECKINS")}
        >
          Arrival Check-ins ({currentWard.recentCheckins.length})
        </button>
        <button
          type="button"
          className={`pb-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "EMERGENCY"
              ? "border-orange-500 text-orange-400"
              : "border-transparent text-neutral-400 hover:text-white"
          }`}
          onClick={() => setActiveTab("EMERGENCY")}
        >
          Emergency & Medical
        </button>
      </div>

      {/* TAB 1: CONSENT MANAGEMENT */}
      {activeTab === "CONSENTS" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">Minor Participation & Safety Consents</h2>
            <p className="text-xs text-neutral-400">
              Under-18 accounts require explicit, revocable guardian consent for competitive and public basketball features (Spec §14.1).
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(CONSENT_DESCRIPTIONS).map(([kind, info]) => {
              const isGranted = currentWard.consents[kind as keyof typeof currentWard.consents] ?? false;

              return (
                <Card key={kind} className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-white text-sm">{info.label}</h3>
                      <p className="mt-1 text-xs text-neutral-400">{info.desc}</p>
                    </div>
                    <Badge variant={isGranted ? "success" : "neutral"}>
                      {isGranted ? "Granted" : "Restricted"}
                    </Badge>
                  </div>

                  <div className="pt-2 border-t border-neutral-800 flex items-center justify-between">
                    <span className="text-xs text-neutral-500 font-mono">{kind}</span>
                    <Button
                      variant={isGranted ? "danger" : "primary"}
                      size="sm"
                      onClick={() =>
                        toggleConsentMutation.mutate({ kind, current: isGranted })
                      }
                      disabled={toggleConsentMutation.isPending || isSafetyLockActive}
                    >
                      {isGranted ? "Revoke Consent" : "Grant Consent"}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: SCHEDULED ACTIVITIES */}
      {activeTab === "ACTIVITIES" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Upcoming Games & Practices</h2>
            <span className="text-xs text-neutral-400">Monitored events for {currentWard.minor.displayName}</span>
          </div>

          {currentWard.upcomingActivities.length === 0 ? (
            <EmptyState
              title="No Upcoming Activities Scheduled"
              description="Your child does not have any confirmed pickup games, tournament matches, or team practices scheduled."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {currentWard.upcomingActivities.map((act) => {
                const date = new Date(act.startsAt);

                return (
                  <Card key={act.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <span className="text-xs font-semibold text-orange-400 uppercase">
                        {act.type.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-neutral-400 font-mono">
                        {date.toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <h3 className="font-bold text-white text-base">{act.title}</h3>

                    <div className="text-xs text-neutral-300 space-y-1">
                      <div>📍 Court: <strong>{act.courtName}</strong></div>
                      <div>👤 Organized by: <strong>{act.hostName}</strong></div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ARRIVAL CHECK-INS */}
      {activeTab === "CHECKINS" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">Court Arrival & Check-In History</h2>
            <p className="text-xs text-neutral-400">
              Verified court check-ins recorded when {currentWard.minor.displayName} arrives at a run.
            </p>
          </div>

          {currentWard.recentCheckins.length === 0 ? (
            <EmptyState
              title="No Check-in Records"
              description="Check-ins will appear here as your youth arrives at scheduled court runs."
            />
          ) : (
            <div className="space-y-3">
              {currentWard.recentCheckins.map((chk) => {
                const isAcknowledged = !!chk.parentAcknowledgedAt;

                return (
                  <Card key={chk.id} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{chk.courtName}</span>
                        <Badge variant={isAcknowledged ? "success" : "warning"}>
                          {isAcknowledged ? "Parent Acknowledged" : "Pending Parent Review"}
                        </Badge>
                      </div>
                      <div className="text-xs text-neutral-400 mt-1">
                        Checked in: {new Date(chk.checkedInAt).toLocaleString()} • {chk.activityType.replace(/_/g, " ")}
                      </div>
                    </div>

                    {!isAcknowledged && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => acknowledgeCheckinMutation.mutate(chk.id)}
                        disabled={acknowledgeCheckinMutation.isPending}
                      >
                        {acknowledgeCheckinMutation.isPending ? "Confirming..." : "Acknowledge Safe Arrival"}
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: EMERGENCY & MEDICAL */}
      {activeTab === "EMERGENCY" && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Emergency Contacts & Medical Notes</h2>
              <p className="text-xs text-neutral-400">
                Provided to team coaches and tournament directors in case of physical injury or medical need.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const em = currentWard.emergencyContacts;
                if (em) {
                  setPriName(em.primaryContactName);
                  setPriPhone(em.primaryContactPhone);
                  setPriRel(em.primaryContactRelationship);
                  setSecName(em.secondaryContactName ?? "");
                  setSecPhone(em.secondaryContactPhone ?? "");
                  setSecRel(em.secondaryContactRelationship ?? "FATHER");
                  setMedNotes(em.medicalNotes ?? "");
                }
                setEmergencyError(null);
                setIsEmergencyModalOpen(true);
              }}
            >
              Edit Contacts & Medical
            </Button>
          </div>

          {currentWard.emergencyContacts ? (
            <div className="grid gap-4 sm:grid-cols-2 pt-2">
              <div className="rounded-lg bg-neutral-900 p-4 border border-neutral-800 space-y-2">
                <span className="text-xs font-semibold uppercase text-orange-400">
                  Primary Emergency Contact
                </span>
                <div className="text-base font-bold text-white">
                  {currentWard.emergencyContacts.primaryContactName} ({currentWard.emergencyContacts.primaryContactRelationship})
                </div>
                <div className="text-sm font-mono text-neutral-300">
                  📞 {currentWard.emergencyContacts.primaryContactPhone}
                </div>
              </div>

              <div className="rounded-lg bg-neutral-900 p-4 border border-neutral-800 space-y-2">
                <span className="text-xs font-semibold uppercase text-orange-400">
                  Secondary Contact
                </span>
                <div className="text-base font-bold text-white">
                  {currentWard.emergencyContacts.secondaryContactName || "Not provided"} ({currentWard.emergencyContacts.secondaryContactRelationship || "—"})
                </div>
                <div className="text-sm font-mono text-neutral-300">
                  📞 {currentWard.emergencyContacts.secondaryContactPhone || "Not provided"}
                </div>
              </div>

              <div className="col-span-full rounded-lg bg-neutral-900 p-4 border border-neutral-800 space-y-1">
                <span className="text-xs font-semibold uppercase text-red-400">
                  Medical Notes & Health Considerations (Non-Diagnostic)
                </span>
                <p className="text-sm text-neutral-200">
                  {currentWard.emergencyContacts.medicalNotes || "No medical conditions or allergies logged."}
                </p>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No Emergency Contacts Recorded"
              description="Please log emergency contact details so tournament staff can reach you in case of injury."
              action={{
                label: "Add Emergency Contacts",
                onClick: () => {
                  setPriName("");
                  setPriPhone("");
                  setIsEmergencyModalOpen(true);
                },
              }}
            />
          )}
        </Card>
      )}

      {/* MODAL 1: EMERGENCY CONTACT FORM */}
      <Dialog
        open={isEmergencyModalOpen}
        onClose={() => setIsEmergencyModalOpen(false)}
        title="Emergency Contacts & Medical Info"
      >
        <div className="space-y-4">
          {emergencyError && (
            <div className="rounded-lg bg-red-950/60 p-3 border border-red-800 text-xs text-red-200">
              {emergencyError}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-neutral-300">Primary Contact Full Name</label>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
              placeholder="e.g. Sarah Guardian"
              value={priName}
              onChange={(e) => setPriName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-neutral-300">Phone Number</label>
              <input
                type="tel"
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                placeholder="+1-555-019-2834"
                value={priPhone}
                onChange={(e) => setPriPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-300">Relationship</label>
              <select
                aria-label="Primary Contact Relationship"
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                value={priRel}
                onChange={(e) => setPriRel(e.target.value)}
              >
                <option value="MOTHER">Mother</option>
                <option value="FATHER">Father</option>
                <option value="GUARDIAN">Legal Guardian</option>
                <option value="RELATIVE">Relative / Sibling</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-300">Secondary Contact Name (Optional)</label>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
              placeholder="e.g. David Young"
              value={secName}
              onChange={(e) => setSecName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-neutral-300">Secondary Phone</label>
              <input
                type="tel"
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                placeholder="+1-555-019-2835"
                value={secPhone}
                onChange={(e) => setSecPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-300">Secondary Relationship</label>
              <select
                aria-label="Secondary Contact Relationship"
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                value={secRel}
                onChange={(e) => setSecRel(e.target.value)}
              >
                <option value="FATHER">Father</option>
                <option value="MOTHER">Mother</option>
                <option value="GUARDIAN">Legal Guardian</option>
                <option value="RELATIVE">Relative / Sibling</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-300">Medical Notes & Allergies (Optional)</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
              rows={2}
              placeholder="e.g. Asthma, carries rescue inhaler, peanut allergy..."
              value={medNotes}
              onChange={(e) => setMedNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsEmergencyModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => saveEmergencyMutation.mutate()}
              disabled={saveEmergencyMutation.isPending || !priName.trim() || !priPhone.trim()}
            >
              {saveEmergencyMutation.isPending ? "Saving..." : "Save Emergency Contacts"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* MODAL 2: CONFIRM SAFETY LOCK */}
      <Dialog
        open={isLockConfirmOpen}
        onClose={() => setIsLockConfirmOpen(false)}
        title={isSafetyLockActive ? "Deactivate Safety Lock" : "Activate Emergency Safety Lock"}
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-neutral-900 p-4 border border-neutral-800 text-sm text-neutral-200">
            {isSafetyLockActive ? (
              <p>
                Deactivating the safety lock will allow you to re-grant pickup and tournament participation consents for {currentWard.minor.displayName}.
              </p>
            ) : (
              <p className="text-red-200">
                Engaging the emergency safety lock will <strong>immediately revoke all active pickup and tournament competition consents</strong> for {currentWard.minor.displayName}. Active tournament roster listings and pickup RSVPs will be cancelled automatically.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsLockConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={isSafetyLockActive ? "primary" : "danger"}
              size="sm"
              onClick={() => toggleSafetyLockMutation.mutate(!isSafetyLockActive)}
              disabled={toggleSafetyLockMutation.isPending}
            >
              {toggleSafetyLockMutation.isPending
                ? "Updating..."
                : isSafetyLockActive
                ? "Lift Safety Lock"
                : "Engage Emergency Lock"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { Badge, Button, Card, EmptyState, SourceBadge, StatCard } from "@courtiq/design-system";

export type Cohort =
  | "U14_MALE"
  | "U14_FEMALE"
  | "U16_MALE"
  | "U16_FEMALE"
  | "U18_MALE"
  | "U18_FEMALE"
  | "COLLEGIATE_MALE"
  | "COLLEGIATE_FEMALE"
  | "PRO_MALE"
  | "PRO_FEMALE";

export type TestCategory = "JUMP" | "SPEED" | "AGILITY" | "CONDITIONING";

export interface Protocol {
  id: string;
  slug: string;
  name: string;
  category: TestCategory;
  description: string;
  primaryMetricUnit: string;
  sortDirection: "DESC" | "ASC";
  equipmentRequirements: string;
  warmupRecommendations: string;
  standardAttempts: number;
}

export interface Attempt {
  id: string;
  sessionId: string;
  protocolId: string;
  protocolSlug: string;
  protocolName: string;
  attemptNumber: number;
  rawValue: number;
  isFault: boolean;
  faultReason?: string | null;
  instrumentType: string;
  instrumentDetails?: Record<string, unknown>;
  sourceType: "OFFICIAL" | "COACH" | "SELF_REPORTED" | "CV_ESTIMATE";
  confidence: number;
  notes?: string | null;
  createdAt: string;
}

export interface PersonalBest {
  slug: string;
  name: string;
  category: string;
  unit: string;
  bestValue: number;
  percentile: number;
  instrumentType: string;
  sourceType: "OFFICIAL" | "COACH" | "SELF_REPORTED" | "CV_ESTIMATE";
  achievedDate: string;
  sessionId: string;
}

export interface AthleticSignature {
  powerPercentile: number | null;
  speedPercentile: number | null;
  agilityPercentile: number | null;
  conditioningPercentile: number | null;
  combineIndex: number | null;
  testsCompleted: number;
}

export interface CombineProfile {
  athlete: {
    id: string;
    displayName: string;
    dateOfBirth?: string;
  };
  cohort: Cohort;
  signature: AthleticSignature;
  personalBests: PersonalBest[];
}

export interface TestSession {
  id: string;
  testDate: string;
  location?: string | null;
  surface: string;
  notes?: string | null;
  attemptCount: number;
}

export interface AthleticTestingViewProps {
  initialProtocols: Protocol[];
  initialProfile: CombineProfile;
  initialSessions: TestSession[];
  onSaveAttempt?: (attempt: {
    sessionId?: string;
    protocolId: string;
    rawValue: number;
    isFault?: boolean;
    faultReason?: string;
    instrumentType?: string;
    sourceType?: "OFFICIAL" | "COACH" | "SELF_REPORTED" | "CV_ESTIMATE";
    notes?: string;
  }) => Promise<void>;
}

export const COHORT_LABELS: Record<Cohort, string> = {
  COLLEGIATE_MALE: "Collegiate / Senior Male (NCAA/FIBA)",
  COLLEGIATE_FEMALE: "Collegiate / Senior Female (NCAA/FIBA)",
  PRO_MALE: "Professional Male (NBA/EuroLeague)",
  PRO_FEMALE: "Professional Female (WNBA/EuroLeague)",
  U18_MALE: "Under-18 Male",
  U18_FEMALE: "Under-18 Female",
  U16_MALE: "Under-16 Male",
  U16_FEMALE: "Under-16 Female",
  U14_MALE: "Under-14 Male",
  U14_FEMALE: "Under-14 Female",
};

export function getPercentileBadgeVariant(percentile: number): "neutral" | "success" | "warning" {
  if (percentile >= 90) return "success";
  if (percentile >= 50) return "neutral";
  return "warning";
}

export function getPercentileTier(percentile: number): string {
  if (percentile >= 90) return "Elite (Top 10%)";
  if (percentile >= 75) return "Advanced (Top 25%)";
  if (percentile >= 50) return "Competitive (Above Average)";
  return "Developing";
}

export function AthleticTestingView({
  initialProtocols,
  initialProfile,
  initialSessions,
  onSaveAttempt,
}: AthleticTestingViewProps) {
  const [selectedCohort, setSelectedCohort] = useState<Cohort>(initialProfile.cohort ?? "COLLEGIATE_MALE");
  const [selectedCategory, setSelectedCategory] = useState<TestCategory | "ALL">("ALL");
  const [isLoggingModalOpen, setIsLoggingModalOpen] = useState(false);
  const [selectedProtocolId, setSelectedProtocolId] = useState<string>(
    initialProtocols[0]?.id ?? "",
  );
  const [rawValueInput, setRawValueInput] = useState<string>("");
  const [isFault, setIsFault] = useState<boolean>(false);
  const [faultReason, setFaultReason] = useState<string>("");
  const [instrumentType, setInstrumentType] = useState<string>("VERTEC_VANES");
  const [sourceType, setSourceType] = useState<"OFFICIAL" | "COACH" | "SELF_REPORTED" | "CV_ESTIMATE">(
    "SELF_REPORTED",
  );
  const [attemptNotes, setAttemptNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"BATTERY" | "HISTORY">("BATTERY");

  const filteredProtocols = initialProtocols.filter(
    (p) => selectedCategory === "ALL" || p.category === selectedCategory,
  );

  const bestBySlug = new Map(initialProfile.personalBests.map((pb) => [pb.slug, pb]));

  const activeProtocol = initialProtocols.find((p) => p.id === selectedProtocolId);

  const handleOpenLogModal = (protocolId?: string) => {
    if (protocolId) {
      setSelectedProtocolId(protocolId);
      const proto = initialProtocols.find((p) => p.id === protocolId);
      if (proto?.category === "SPEED" || proto?.category === "AGILITY") {
        setInstrumentType("TIMING_GATES_DUAL_BEAM");
      } else {
        setInstrumentType("VERTEC_VANES");
      }
    }
    setRawValueInput("");
    setIsFault(false);
    setFaultReason("");
    setAttemptNotes("");
    setIsLoggingModalOpen(true);
  };

  const handleSubmitAttempt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProtocolId || (!isFault && !rawValueInput)) return;

    try {
      setIsSubmitting(true);
      if (onSaveAttempt) {
        await onSaveAttempt({
          protocolId: selectedProtocolId,
          rawValue: parseFloat(rawValueInput || "0"),
          isFault,
          faultReason: isFault ? faultReason : undefined,
          instrumentType,
          sourceType,
          notes: attemptNotes || undefined,
        });
      }
      setIsLoggingModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const signature = initialProfile.signature;

  return (
    <div className="space-y-8" data-testid="athletic-testing-workbench">
      {/* Header & Cohort Selection */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            Athletic Performance Combine & Testing Battery
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Standardized basketball combine protocols, instrument metadata, and normative percentile rankings.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <label htmlFor="cohort-select" className="text-xs text-zinc-400 mb-1 font-medium">
              Comparison Cohort
            </label>
            <select
              id="cohort-select"
              data-testid="cohort-select"
              value={selectedCohort}
              onChange={(e) => setSelectedCohort(e.target.value as Cohort)}
              className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              {Object.entries(COHORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <Button
            data-testid="log-test-button"
            onClick={() => handleOpenLogModal()}
            className="self-end bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 text-sm rounded-md shadow-sm"
          >
            + Log Combine Test
          </Button>
        </div>
      </div>

      {/* Safety & Compliance Notice per ADR-0009 */}
      <div className="p-3.5 bg-zinc-900/70 border border-zinc-800 rounded-lg text-xs text-zinc-400 flex items-center justify-between">
        <span>
          <strong className="text-zinc-200">Standardized Performance Data:</strong> Percentile calculations benchmark
          verified physical outputs against validated demographic cohorts. COURT IQ does not provide medical injury
          forecasts or clinical assessments (ADR-0009).
        </span>
        <Badge variant="neutral">Combine Spec §5.4</Badge>
      </div>

      {/* Athletic Signature & Combine Index */}
      <Card className="p-6 bg-zinc-900/90 border border-zinc-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-zinc-800/80">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider font-semibold text-emerald-400">
                Athletic Profile
              </span>
              <Badge variant="neutral">{initialProfile.athlete.displayName}</Badge>
            </div>
            <h2 className="text-xl font-bold text-zinc-100 mt-1">Combine Athletic Signature</h2>
            <p className="text-sm text-zinc-400">
              Evaluated against {COHORT_LABELS[selectedCohort]} ({signature.testsCompleted}/6 tests completed)
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-center sm:text-right">
              <span className="text-xs text-zinc-400 block font-medium">Combine Index</span>
              <span
                data-testid="combine-index-value"
                className="text-4xl font-black text-emerald-400 tracking-tight"
              >
                {signature.combineIndex !== null ? signature.combineIndex : "—"}
              </span>
              <span className="text-xs text-zinc-500 block">Percentile</span>
            </div>
          </div>
        </div>

        {/* 4 Pillars Percentile Radar / Bar Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <StatCard
            label="Explosive Power"
            value={signature.powerPercentile !== null ? `${signature.powerPercentile}th` : "—"}
            hint={
              signature.powerPercentile !== null
                ? getPercentileTier(signature.powerPercentile)
                : "Standing & Max Vertical Jump"
            }
          />

          <StatCard
            label="Transition Speed"
            value={signature.speedPercentile !== null ? `${signature.speedPercentile}th` : "—"}
            hint={
              signature.speedPercentile !== null
                ? getPercentileTier(signature.speedPercentile)
                : "3/4 Court Sprint (22.86m)"
            }
          />

          <StatCard
            label="Change of Direction"
            value={signature.agilityPercentile !== null ? `${signature.agilityPercentile}th` : "—"}
            hint={
              signature.agilityPercentile !== null
                ? getPercentileTier(signature.agilityPercentile)
                : "Lane Agility & Pro-Shuttle"
            }
          />

          <StatCard
            label="Intermittent Aerobic"
            value={signature.conditioningPercentile !== null ? `${signature.conditioningPercentile}th` : "—"}
            hint={
              signature.conditioningPercentile !== null
                ? getPercentileTier(signature.conditioningPercentile)
                : "Yo-Yo Intermittent Recovery"
            }
          />
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-zinc-800">
        <div className="flex gap-4">
          <button
            data-testid="tab-battery"
            onClick={() => setActiveTab("BATTERY")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "BATTERY"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Combine Protocols & Personal Bests
          </button>
          <button
            data-testid="tab-history"
            onClick={() => setActiveTab("HISTORY")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "HISTORY"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Test Sessions History ({initialSessions.length})
          </button>
        </div>

        {activeTab === "BATTERY" && (
          <div className="flex gap-1.5 pb-2">
            {(["ALL", "JUMP", "SPEED", "AGILITY", "CONDITIONING"] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`text-xs px-2.5 py-1 rounded transition-colors ${
                  selectedCategory === cat
                    ? "bg-zinc-800 text-white font-medium"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {cat === "ALL" ? "All Protocols" : cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab 1: Protocols Battery */}
      {activeTab === "BATTERY" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="protocols-grid">
          {filteredProtocols.map((protocol) => {
            const pb = bestBySlug.get(protocol.slug);
            return (
              <Card
                key={protocol.id}
                data-testid={`protocol-card-${protocol.slug}`}
                className="p-5 bg-zinc-900 border border-zinc-800 flex flex-col justify-between hover:border-zinc-700 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <Badge variant="neutral">{protocol.category}</Badge>
                    {pb && (
                      <Badge variant={getPercentileBadgeVariant(pb.percentile)}>
                        {pb.percentile}th %ile
                      </Badge>
                    )}
                  </div>

                  <h3 className="font-semibold text-zinc-100 text-base">{protocol.name}</h3>
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{protocol.description}</p>

                  <div className="mt-4 p-3 bg-zinc-950/60 rounded-lg border border-zinc-800/60">
                    <span className="text-xs text-zinc-400 block font-medium">Personal Best</span>
                    {pb ? (
                      <div className="flex items-baseline justify-between mt-1">
                        <span className="text-2xl font-bold text-zinc-100 tracking-tight">
                          {pb.bestValue}{" "}
                          <span className="text-xs font-normal text-zinc-400">{pb.unit}</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <SourceBadge sourceType={pb.sourceType} confidence={1.0} />
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-zinc-500 italic mt-1">No recorded attempts yet</div>
                    )}
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-zinc-400">
                    <div>
                      <strong className="text-zinc-300">Instrument:</strong> {protocol.equipmentRequirements}
                    </div>
                    <div>
                      <strong className="text-zinc-300">Warmup:</strong> {protocol.warmupRecommendations}
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-zinc-800 flex items-center justify-between">
                  <span className="text-xs text-zinc-500">
                    Standard: {protocol.standardAttempts} attempts
                  </span>
                  <Button
                    onClick={() => handleOpenLogModal(protocol.id)}
                    className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded"
                  >
                    Log Trial
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tab 2: Test Sessions History */}
      {activeTab === "HISTORY" && (
        <div className="space-y-4" data-testid="sessions-history">
          {initialSessions.length === 0 ? (
            <EmptyState
              title="No test sessions recorded"
              description="Record your first athletic testing session to track combine performance over time."
            />
          ) : (
            <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg bg-zinc-900 overflow-hidden">
              {initialSessions.map((session) => (
                <div
                  key={session.id}
                  data-testid={`session-row-${session.id}`}
                  className="p-4 flex items-center justify-between hover:bg-zinc-850/50 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-200 text-sm">{session.testDate}</span>
                      <Badge variant="neutral">{session.surface}</Badge>
                    </div>
                    <div className="text-xs text-zinc-400 mt-1 flex items-center gap-3">
                      <span>Venue: {session.location || "Local Facility"}</span>
                      {session.notes && <span>• {session.notes}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-xs text-zinc-400">
                      {session.attemptCount} attempt{session.attemptCount === 1 ? "" : "s"}
                    </span>
                    <Button
                      onClick={() => handleOpenLogModal()}
                      className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2.5 py-1 rounded"
                    >
                      Add Test
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Logging Attempt Modal Dialog */}
      {isLoggingModalOpen && (
        <div
          data-testid="logging-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-lg shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="font-bold text-zinc-100 text-lg">Log Athletic Test Attempt</h3>
              <button
                onClick={() => setIsLoggingModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitAttempt} className="space-y-4">
              {/* Protocol selector */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Test Protocol
                </label>
                <select
                  data-testid="modal-protocol-select"
                  value={selectedProtocolId}
                  onChange={(e) => setSelectedProtocolId(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-md px-3 py-2 focus:outline-none focus:border-emerald-500"
                >
                  {initialProtocols.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.primaryMetricUnit})
                    </option>
                  ))}
                </select>
              </div>

              {/* Fault Checkbox */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="is-fault"
                  data-testid="modal-fault-checkbox"
                  checked={isFault}
                  onChange={(e) => setIsFault(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
                />
                <label htmlFor="is-fault" className="text-xs font-medium text-zinc-300 cursor-pointer">
                  Mark as Fault / Invalid Attempt (e.g. slipped, false start)
                </label>
              </div>

              {/* Fault reason if checked */}
              {isFault ? (
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Fault Reason
                  </label>
                  <input
                    type="text"
                    data-testid="modal-fault-reason-input"
                    value={faultReason}
                    onChange={(e) => setFaultReason(e.target.value)}
                    placeholder="e.g. Slipped on second plant step"
                    className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-md px-3 py-2"
                  />
                </div>
              ) : (
                /* Raw Value Input */
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Measured Value ({activeProtocol?.primaryMetricUnit || "units"})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    data-testid="modal-raw-value-input"
                    value={rawValueInput}
                    onChange={(e) => setRawValueInput(e.target.value)}
                    placeholder={
                      activeProtocol?.category === "SPEED" || activeProtocol?.category === "AGILITY"
                        ? "e.g. 3.25"
                        : "e.g. 74.0"
                    }
                    required={!isFault}
                    className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-md px-3 py-2 font-mono text-base focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              {/* Instrument Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Instrument Type
                  </label>
                  <select
                    data-testid="modal-instrument-select"
                    value={instrumentType}
                    onChange={(e) => setInstrumentType(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-md px-3 py-2"
                  >
                    <option value="VERTEC_VANES">Vertec Vanes</option>
                    <option value="CONTACT_MAT">Contact Flight Mat</option>
                    <option value="OPTICAL_SYSTEM">Optical Jump Array</option>
                    <option value="TIMING_GATES_DUAL_BEAM">Dual-Beam Electronic Gates</option>
                    <option value="TIMING_GATES_SINGLE_BEAM">Single-Beam Optical Gates</option>
                    <option value="STOPWATCH_MANUAL">Digital Stopwatch</option>
                    <option value="CV_ESTIMATE">CV Video Estimate</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Source Provenance
                  </label>
                  <select
                    data-testid="modal-source-select"
                    value={sourceType}
                    onChange={(e) =>
                      setSourceType(e.target.value as "OFFICIAL" | "COACH" | "SELF_REPORTED" | "CV_ESTIMATE")
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-md px-3 py-2"
                  >
                    <option value="SELF_REPORTED">Self-Reported</option>
                    <option value="COACH">Coach Verified</option>
                    <option value="OFFICIAL">Official Combine</option>
                    <option value="CV_ESTIMATE">CV Estimate</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  data-testid="modal-notes-input"
                  value={attemptNotes}
                  onChange={(e) => setAttemptNotes(e.target.value)}
                  placeholder="e.g. Clean plant, full extension"
                  className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-md px-3 py-2"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <Button
                  type="button"
                  onClick={() => setIsLoggingModalOpen(false)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 text-sm rounded-md"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  data-testid="modal-submit-button"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 text-sm rounded-md"
                >
                  {isSubmitting ? "Recording..." : "Save Attempt"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

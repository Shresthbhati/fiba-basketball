"use client";

import Link from "next/link";

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
} from "@courtiq/design-system";
import { api, ApiError } from "./api";

export interface FacilityCourt {
  id: string;
  name: string;
  lat: number;
  lng: number;
  indoor: boolean;
  surface: string | null;
  hoops: number | null;
  lit: boolean | null;
  accessNotes: string | null;
  verificationStatus: string;
}

export interface OperatingHour {
  id: string;
  courtId: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  slotDurationMinutes: number;
  hourlyRateCents: number;
  currency: string;
  isClosed: boolean;
}

export interface CourtReservation {
  id: string;
  courtId: string;
  bookedById: string | null;
  startTime: string;
  endTime: string;
  purpose: string;
  status: string;
  totalPriceCents: number;
  notes: string | null;
  createdAt: string;
}

export interface MaintenanceLog {
  id: string;
  courtId: string;
  category: string;
  description: string;
  severity: "ROUTINE" | "RECOMMENDED" | "URGENT_SAFETY_HAZARD";
  costCents: number;
  performedAt: string;
  nextInspectionDue: string | null;
  createdAt: string;
  loggerName?: string | null;
}

export interface FacilityAnalytics {
  courtId: string;
  totalBookings: number;
  confirmedBookings: number;
  cancelledBookings: number;
  totalRevenueCents: number;
  utilizationRate: number;
  maintenanceCount: number;
  urgentHazardsCount: number;
  totalMaintenanceSpendCents: number;
  nextInspectionDue: string | null;
  purposeBreakdown: Record<string, number>;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Mock fallback data for dev & offline demo
const FALLBACK_COURTS: FacilityCourt[] = [
  {
    id: "f1a1a1a1-1111-4000-8000-000000000001",
    name: "Brooklyn Basketball Complex (Main Arena)",
    lat: 40.6782,
    lng: -73.9442,
    indoor: true,
    surface: "WOOD",
    hoops: 2,
    lit: true,
    accessNotes: "East entrance via Atlantic Avenue glass lobby",
    verificationStatus: "FACILITY_VERIFIED",
  },
  {
    id: "f1a1a1a1-1111-4000-8000-000000000002",
    name: "Downtown Outdoor Court 2",
    lat: 40.6902,
    lng: -73.9852,
    indoor: false,
    surface: "ASPHALT",
    hoops: 2,
    lit: true,
    accessNotes: "Public park access 6 AM - 10 PM",
    verificationStatus: "COMMUNITY_CONFIRMED",
  },
];

const FALLBACK_HOURS: OperatingHour[] = [
  { id: "h0", courtId: "c1", dayOfWeek: 0, openTime: "08:00", closeTime: "20:00", slotDurationMinutes: 60, hourlyRateCents: 4000, currency: "USD", isClosed: false },
  { id: "h1", courtId: "c1", dayOfWeek: 1, openTime: "07:00", closeTime: "22:00", slotDurationMinutes: 60, hourlyRateCents: 5000, currency: "USD", isClosed: false },
  { id: "h2", courtId: "c1", dayOfWeek: 2, openTime: "07:00", closeTime: "22:00", slotDurationMinutes: 60, hourlyRateCents: 5000, currency: "USD", isClosed: false },
  { id: "h3", courtId: "c1", dayOfWeek: 3, openTime: "07:00", closeTime: "22:00", slotDurationMinutes: 60, hourlyRateCents: 5000, currency: "USD", isClosed: false },
  { id: "h4", courtId: "c1", dayOfWeek: 4, openTime: "07:00", closeTime: "22:00", slotDurationMinutes: 60, hourlyRateCents: 5000, currency: "USD", isClosed: false },
  { id: "h5", courtId: "c1", dayOfWeek: 5, openTime: "08:00", closeTime: "23:00", slotDurationMinutes: 60, hourlyRateCents: 6000, currency: "USD", isClosed: false },
  { id: "h6", courtId: "c1", dayOfWeek: 6, openTime: "08:00", closeTime: "23:00", slotDurationMinutes: 60, hourlyRateCents: 6000, currency: "USD", isClosed: false },
];

const FALLBACK_RESERVATIONS: CourtReservation[] = [
  {
    id: "res-1",
    courtId: "f1a1a1a1-1111-4000-8000-000000000001",
    bookedById: "u1",
    startTime: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
    endTime: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
    purpose: "TEAM_PRACTICE",
    status: "CONFIRMED",
    totalPriceCents: 10000,
    notes: "Varsity team 5v5 tactical scrimmage",
    createdAt: new Date().toISOString(),
  },
  {
    id: "res-2",
    courtId: "f1a1a1a1-1111-4000-8000-000000000001",
    bookedById: null,
    startTime: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    endTime: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    purpose: "LEAGUE_MATCH",
    status: "CONFIRMED",
    totalPriceCents: 12000,
    notes: "Brooklyn Metro League Semi-Final",
    createdAt: new Date().toISOString(),
  },
];

const FALLBACK_MAINTENANCE: MaintenanceLog[] = [
  {
    id: "m-1",
    courtId: "f1a1a1a1-1111-4000-8000-000000000001",
    category: "RIM_REPLACEMENT",
    description: "Replaced bent south basket with FIBA approved breakaway rim and anti-whip net.",
    severity: "URGENT_SAFETY_HAZARD",
    costCents: 18500,
    performedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    nextInspectionDue: new Date(Date.now() + 60 * 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    loggerName: "Dave Operator",
  },
  {
    id: "m-2",
    courtId: "f1a1a1a1-1111-4000-8000-000000000001",
    category: "SURFACE_RESURFACING",
    description: "Hardwood polish and traction grip re-coat on north key.",
    severity: "ROUTINE",
    costCents: 45000,
    performedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    nextInspectionDue: new Date(Date.now() + 120 * 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    loggerName: "Dave Operator",
  },
];

const FALLBACK_ANALYTICS: FacilityAnalytics = {
  courtId: "f1a1a1a1-1111-4000-8000-000000000001",
  totalBookings: 24,
  confirmedBookings: 21,
  cancelledBookings: 3,
  totalRevenueCents: 185000,
  utilizationRate: 74,
  maintenanceCount: 5,
  urgentHazardsCount: 1,
  totalMaintenanceSpendCents: 63500,
  nextInspectionDue: new Date(Date.now() + 60 * 86400000).toISOString(),
  purposeBreakdown: {
    TEAM_PRACTICE: 12,
    LEAGUE_MATCH: 6,
    PICKUP_RUN: 4,
    TRAINING: 2,
  },
};

export function FacilityWorkspace() {
  const qc = useQueryClient();

  // Current selected court
  const [selectedCourtId, setSelectedCourtId] = useState<string>(FALLBACK_COURTS[0]?.id ?? "court-1");
  const [activeTab, setActiveTab] = useState<"SCHEDULE" | "MAINTENANCE" | "HOURS" | "ANALYTICS">("SCHEDULE");

  // Dialog states
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [isMaintenanceOpen, setIsMaintenanceOpen] = useState(false);
  const [isClaimOpen, setIsClaimOpen] = useState(false);

  // Booking Form State
  const [bookDate, setBookDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0] ?? "2026-10-25";
  });
  const [bookStart, setBookStart] = useState("14:00");
  const [bookEnd, setBookEnd] = useState("16:00");
  const [bookPurpose, setBookPurpose] = useState<string>("TEAM_PRACTICE");
  const [bookNotes, setBookNotes] = useState("");
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Maintenance Form State
  const [maintCategory, setMaintCategory] = useState("RIM_REPLACEMENT");
  const [maintSeverity, setMaintSeverity] = useState<"ROUTINE" | "RECOMMENDED" | "URGENT_SAFETY_HAZARD">("ROUTINE");
  const [maintDesc, setMaintDesc] = useState("");
  const [maintCost, setMaintCost] = useState("150");
  const [maintNextInspection, setMaintNextInspection] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().split("T")[0] ?? "2027-01-25";
  });
  const [maintError, setMaintError] = useState<string | null>(null);

  // Claim Form State
  const [claimBusinessName, setClaimBusinessName] = useState("");
  const [claimEmail, setClaimEmail] = useState("");
  const [claimPhone, setClaimPhone] = useState("");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState(false);

  // Queries
  const courtsQuery = useQuery<FacilityCourt[]>({
    queryKey: ["facility-courts"],
    queryFn: async () => {
      try {
        const res = await api<{ items?: FacilityCourt[] }>("/courts");
        if (Array.isArray(res)) return res as FacilityCourt[];
        if (res.items && res.items.length > 0) return res.items;
        return FALLBACK_COURTS;
      } catch {
        return FALLBACK_COURTS;
      }
    },
  });

  const courts = courtsQuery.data ?? FALLBACK_COURTS;
  const currentCourt: FacilityCourt = courts.find((c) => c.id === selectedCourtId) ?? courts[0] ?? FALLBACK_COURTS[0]!;

  const facilityStatusQuery = useQuery({
    queryKey: ["facility-status", currentCourt.id],
    queryFn: async () => {
      try {
        return await api<{
          court: FacilityCourt;
          isManager: boolean;
          userClaim: { status: string; businessName: string } | null;
        }>(`/courts/${currentCourt.id}/facility-status`);
      } catch {
        return {
          court: currentCourt,
          isManager: true, // fallback to enable manager workbench in preview
          userClaim: null,
        };
      }
    },
  });

  const hoursQuery = useQuery<OperatingHour[]>({
    queryKey: ["facility-hours", currentCourt.id],
    queryFn: async () => {
      try {
        const res = await api<OperatingHour[]>(`/courts/${currentCourt.id}/operating-hours`);
        return res.length > 0 ? res : FALLBACK_HOURS;
      } catch {
        return FALLBACK_HOURS;
      }
    },
  });

  const reservationsQuery = useQuery<CourtReservation[]>({
    queryKey: ["facility-reservations", currentCourt.id],
    queryFn: async () => {
      try {
        return await api<CourtReservation[]>(`/courts/${currentCourt.id}/reservations`);
      } catch {
        return FALLBACK_RESERVATIONS;
      }
    },
  });

  const maintenanceQuery = useQuery<MaintenanceLog[]>({
    queryKey: ["facility-maintenance", currentCourt.id],
    queryFn: async () => {
      try {
        return await api<MaintenanceLog[]>(`/courts/${currentCourt.id}/maintenance`);
      } catch {
        return FALLBACK_MAINTENANCE;
      }
    },
  });

  const analyticsQuery = useQuery<FacilityAnalytics>({
    queryKey: ["facility-analytics", currentCourt.id],
    queryFn: async () => {
      try {
        return await api<FacilityAnalytics>(`/courts/${currentCourt.id}/facility-analytics`);
      } catch {
        return FALLBACK_ANALYTICS;
      }
    },
    enabled: facilityStatusQuery.data?.isManager ?? true,
  });

  // Mutations
  const bookMutation = useMutation({
    mutationFn: async () => {
      const startIso = new Date(`${bookDate}T${bookStart}:00`).toISOString();
      const endIso = new Date(`${bookDate}T${bookEnd}:00`).toISOString();
      return api(`/courts/${currentCourt.id}/reservations`, {
        method: "POST",
        body: {
          startTime: startIso,
          endTime: endIso,
          purpose: bookPurpose,
          notes: bookNotes.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["facility-reservations", currentCourt.id] });
      qc.invalidateQueries({ queryKey: ["facility-analytics", currentCourt.id] });
      setIsBookingOpen(false);
      setBookingError(null);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setBookingError(err.message || "Failed to book court slot");
      } else {
        setBookingError("Failed to book reservation slot. Please try another time.");
      }
    },
  });

  const maintenanceMutation = useMutation({
    mutationFn: async () => {
      const costCents = Math.round(parseFloat(maintCost || "0") * 100);
      return api(`/courts/${currentCourt.id}/maintenance`, {
        method: "POST",
        body: {
          category: maintCategory,
          severity: maintSeverity,
          description: maintDesc.trim(),
          costCents,
          performedAt: new Date().toISOString(),
          nextInspectionDue: maintNextInspection ? new Date(`${maintNextInspection}T12:00:00Z`).toISOString() : undefined,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["facility-maintenance", currentCourt.id] });
      qc.invalidateQueries({ queryKey: ["facility-analytics", currentCourt.id] });
      setIsMaintenanceOpen(false);
      setMaintDesc("");
      setMaintError(null);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setMaintError(err.message || "Failed to log maintenance");
      } else {
        setMaintError("Failed to save maintenance record");
      }
    },
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      return api(`/courts/${currentCourt.id}/claims`, {
        method: "POST",
        body: {
          businessName: claimBusinessName.trim(),
          contactEmail: claimEmail.trim(),
          contactPhone: claimPhone.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["facility-status", currentCourt.id] });
      setClaimSuccess(true);
      setClaimError(null);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setClaimError(err.message || "Failed to submit facility claim");
      } else {
        setClaimError("Failed to submit claim. You may already have a pending submission.");
      }
    },
  });

  const cancelReservationMutation = useMutation({
    mutationFn: async (reservationId: string) => {
      return api(`/reservations/${reservationId}/cancel`, {
        method: "POST",
        body: {
          reason: "Cancelled by user via dashboard",
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["facility-reservations", currentCourt.id] });
      qc.invalidateQueries({ queryKey: ["facility-analytics", currentCourt.id] });
    },
  });

  // Calculate estimated booking cost
  const estimatedCost = useMemo(() => {
    try {
      const startParts = bookStart.split(":");
      const endParts = bookEnd.split(":");
      const sh = Number(startParts[0] ?? 0);
      const sm = Number(startParts[1] ?? 0);
      const eh = Number(endParts[0] ?? 0);
      const em = Number(endParts[1] ?? 0);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      if (endMin <= startMin) return 0;
      const durationHours = (endMin - startMin) / 60;
      const dayIndex = new Date(bookDate || Date.now()).getDay();
      const dayRate = hoursQuery.data?.find((h) => h.dayOfWeek === dayIndex)?.hourlyRateCents ?? 5000;
      return (durationHours * dayRate) / 100;
    } catch {
      return 0;
    }
  }, [bookDate, bookStart, bookEnd, hoursQuery.data]);

  const isFacilityVerified = currentCourt.verificationStatus === "FACILITY_VERIFIED";
  const analytics = analyticsQuery.data ?? FALLBACK_ANALYTICS;
  const reservations = reservationsQuery.data ?? FALLBACK_RESERVATIONS;
  const maintenanceLogs = maintenanceQuery.data ?? FALLBACK_MAINTENANCE;
  const hours = hoursQuery.data ?? FALLBACK_HOURS;

  return (
    <div className="space-y-6">
      {/* Header Court Banner */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-orange-400">
                Facility Operations & Reservations
              </span>
              <Badge variant={isFacilityVerified ? "success" : "warning"}>
                {currentCourt.verificationStatus}
              </Badge>
              {currentCourt.indoor ? (
                <Badge variant="neutral">Indoor Arena</Badge>
              ) : (
                <Badge variant="neutral">Outdoor Court</Badge>
              )}
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{currentCourt.name}</h1>
            <p className="text-sm text-neutral-400">
              Surface: {currentCourt.surface ?? "Hardwood"} • Hoops: {currentCourt.hoops ?? 2} •{" "}
              {currentCourt.accessNotes ?? "Public or member entry"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {courts.length > 1 && (
              <select
                aria-label="Select court facility"
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-orange-500"
                value={selectedCourtId}
                onChange={(e) => setSelectedCourtId(e.target.value)}
              >
                {courts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            {!isFacilityVerified && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setClaimSuccess(false);
                  setIsClaimOpen(true);
                }}
              >
                Claim This Facility
              </Button>
            )}

            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setBookingError(null);
                setIsBookingOpen(true);
              }}
            >
              + Reserve Court Slot
            </Button>
          </div>
        </div>

        {/* Operational KPI Cards */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-neutral-900/80 p-3.5 border border-neutral-800">
            <div className="text-xs text-neutral-400">14-Day Utilization</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold text-orange-400">{analytics.utilizationRate}%</span>
              <span className="text-xs text-neutral-500">capacity</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-neutral-800 overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full transition-all"
                style={{ width: `${analytics.utilizationRate}%` }}
              />
            </div>
          </div>

          <div className="rounded-lg bg-neutral-900/80 p-3.5 border border-neutral-800">
            <div className="text-xs text-neutral-400">Active Bookings</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold text-white">{analytics.confirmedBookings}</span>
              <span className="text-xs text-neutral-500">confirmed</span>
            </div>
            <div className="mt-2 text-xs text-neutral-500">
              {analytics.cancelledBookings} cancelled
            </div>
          </div>

          <div className="rounded-lg bg-neutral-900/80 p-3.5 border border-neutral-800">
            <div className="text-xs text-neutral-400">Total Booking Revenue</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold text-emerald-400">
                ${(analytics.totalRevenueCents / 100).toLocaleString()}
              </span>
              <span className="text-xs text-neutral-500">gross</span>
            </div>
            <div className="mt-2 text-xs text-neutral-500">
              Avg ${(analytics.totalRevenueCents / Math.max(1, analytics.confirmedBookings) / 100).toFixed(0)} / slot
            </div>
          </div>

          <div className="rounded-lg bg-neutral-900/80 p-3.5 border border-neutral-800">
            <div className="text-xs text-neutral-400">Court Maintenance</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xl font-bold text-white">{analytics.maintenanceCount}</span>
              {analytics.urgentHazardsCount > 0 ? (
                <Badge variant="danger">{analytics.urgentHazardsCount} hazard</Badge>
              ) : (
                <Badge variant="success">All Clear</Badge>
              )}
            </div>
            <div className="mt-2 text-xs text-neutral-500">
              Spend: ${(analytics.totalMaintenanceSpendCents / 100).toFixed(0)}
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs Navigation */}
      <div className="flex border-b border-neutral-800 gap-2">
        <button
          type="button"
          className={`pb-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "SCHEDULE"
              ? "border-orange-500 text-orange-400"
              : "border-transparent text-neutral-400 hover:text-white"
          }`}
          onClick={() => setActiveTab("SCHEDULE")}
        >
          Court Schedule & Reservations ({reservations.length})
        </button>
        <button
          type="button"
          className={`pb-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "MAINTENANCE"
              ? "border-orange-500 text-orange-400"
              : "border-transparent text-neutral-400 hover:text-white"
          }`}
          onClick={() => setActiveTab("MAINTENANCE")}
        >
          Maintenance Logs ({maintenanceLogs.length})
        </button>
        <button
          type="button"
          className={`pb-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "HOURS"
              ? "border-orange-500 text-orange-400"
              : "border-transparent text-neutral-400 hover:text-white"
          }`}
          onClick={() => setActiveTab("HOURS")}
        >
          Operating Hours & Rates
        </button>
        <button
          type="button"
          className={`pb-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "ANALYTICS"
              ? "border-orange-500 text-orange-400"
              : "border-transparent text-neutral-400 hover:text-white"
          }`}
          onClick={() => setActiveTab("ANALYTICS")}
        >
          Utilization Analytics
        </button>
      </div>

      {/* TAB 1: SCHEDULE & RESERVATIONS */}
      {activeTab === "SCHEDULE" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Upcoming Reserved Time Slots</h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setBookingError(null);
                setIsBookingOpen(true);
              }}
            >
              + Book New Slot
            </Button>
          </div>

          {reservations.length === 0 ? (
            <EmptyState
              title="No Reservations Scheduled"
              description="This court is open and available for bookings. Select a time block to reserve the floor."
              action={{
                label: "Book a Slot",
                onClick: () => setIsBookingOpen(true),
              }}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {reservations.map((res) => {
                const start = new Date(res.startTime);
                const end = new Date(res.endTime);
                const isConfirmed = res.status === "CONFIRMED";
                const isCancelled = res.status === "CANCELLED";

                return (
                  <Card key={res.id} className="p-4 space-y-3 relative overflow-hidden">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs text-neutral-400">
                          {start.toLocaleDateString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                        <div className="text-base font-bold text-white">
                          {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} –{" "}
                          {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>

                      <Badge
                        variant={
                          isConfirmed ? "success" : isCancelled ? "danger" : "neutral"
                        }
                      >
                        {res.status}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-xs text-neutral-300">
                      <span className="rounded bg-neutral-800 px-2 py-0.5 font-medium text-orange-400">
                        {res.purpose.replace(/_/g, " ")}
                      </span>
                      {res.totalPriceCents > 0 && (
                        <span className="font-semibold text-emerald-400">
                          ${(res.totalPriceCents / 100).toFixed(2)}
                        </span>
                      )}
                    </div>

                    {res.notes && (
                      <p className="text-xs text-neutral-400 italic border-l-2 border-neutral-700 pl-2">
                        &ldquo;{res.notes}&rdquo;
                      </p>
                    )}

                    {isConfirmed && (
                      <div className="pt-2 border-t border-neutral-800/80 flex justify-end">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => cancelReservationMutation.mutate(res.id)}
                          disabled={cancelReservationMutation.isPending}
                        >
                          Cancel Booking
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MAINTENANCE LOGS */}
      {activeTab === "MAINTENANCE" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Court Equipment & Surface Maintenance</h2>
              <p className="text-xs text-neutral-400">
                Transparent logs for rim safety, floor resurfacing, and safety audits.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setMaintError(null);
                setIsMaintenanceOpen(true);
              }}
            >
              + Log Maintenance
            </Button>
          </div>

          {maintenanceLogs.length === 0 ? (
            <EmptyState
              title="No Maintenance Records Logged"
              description="Keep your facility in pristine condition by logging surface polishing, rim replacements, and periodic FIBA safety checks."
              action={{
                label: "Log Maintenance",
                onClick: () => setIsMaintenanceOpen(true),
              }}
            />
          ) : (
            <div className="space-y-3">
              {maintenanceLogs.map((log) => {
                const isUrgent = log.severity === "URGENT_SAFETY_HAZARD";
                const isRecommended = log.severity === "RECOMMENDED";

                return (
                  <Card key={log.id} className="p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">
                          {log.category.replace(/_/g, " ")}
                        </span>
                        <Badge
                          variant={
                            isUrgent ? "danger" : isRecommended ? "warning" : "neutral"
                          }
                        >
                          {log.severity.replace(/_/g, " ")}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-neutral-400">
                        <span>
                          Performed: {new Date(log.performedAt).toLocaleDateString()}
                        </span>
                        {log.costCents > 0 && (
                          <span className="text-emerald-400 font-semibold">
                            ${(log.costCents / 100).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="mt-2 text-sm text-neutral-300">{log.description}</p>

                    <div className="mt-3 flex flex-wrap items-center justify-between text-xs text-neutral-500 border-t border-neutral-800/80 pt-2">
                      <span>Logged by: {log.loggerName ?? "Facility Staff"}</span>
                      {log.nextInspectionDue && (
                        <span>
                          Next Inspection Due:{" "}
                          <strong className="text-neutral-300">
                            {new Date(log.nextInspectionDue).toLocaleDateString()}
                          </strong>
                        </span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: OPERATING HOURS & RATES */}
      {activeTab === "HOURS" && (
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">Weekly Operating Schedule & Hourly Rates</h2>
            <p className="text-xs text-neutral-400">
              Opening times and standard rental fee schedule applied to booking slots.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-neutral-300">
              <thead className="border-b border-neutral-800 text-xs uppercase text-neutral-500">
                <tr>
                  <th className="py-2.5 px-3">Day</th>
                  <th className="py-2.5 px-3">Hours</th>
                  <th className="py-2.5 px-3">Slot Duration</th>
                  <th className="py-2.5 px-3">Hourly Rate</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 font-mono text-xs">
                {hours.map((h) => (
                  <tr key={h.dayOfWeek} className="hover:bg-neutral-900/50">
                    <td className="py-2.5 px-3 font-sans font-medium text-white">
                      {DAY_NAMES[h.dayOfWeek]}
                    </td>
                    <td className="py-2.5 px-3">
                      {h.isClosed ? "—" : `${h.openTime} – ${h.closeTime}`}
                    </td>
                    <td className="py-2.5 px-3">
                      {h.isClosed ? "—" : `${h.slotDurationMinutes} mins`}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-emerald-400">
                      {h.isClosed ? "—" : `$${(h.hourlyRateCents / 100).toFixed(2)} / hr`}
                    </td>
                    <td className="py-2.5 px-3">
                      {h.isClosed ? (
                        <Badge variant="danger">Closed</Badge>
                      ) : (
                        <Badge variant="success">Open</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 4: VENUE ANALYTICS */}
      {activeTab === "ANALYTICS" && (
        <div className="space-y-4">
          <Card className="p-6 space-y-4">
            <h2 className="text-base font-semibold text-white">Booking Distribution by Purpose</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(analytics.purposeBreakdown).map(([purpose, count]) => (
                <div key={purpose} className="rounded-lg bg-neutral-900 p-3 border border-neutral-800">
                  <div className="text-xs text-neutral-400">{purpose.replace(/_/g, " ")}</div>
                  <div className="mt-1 text-2xl font-bold text-white">{count}</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {Math.round((count / Math.max(1, analytics.confirmedBookings)) * 100)}% of bookings
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6 space-y-3">
            <h2 className="text-base font-semibold text-white">Facility Revenue & Maintenance Summary</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg bg-neutral-900 p-3 border border-neutral-800">
                <span className="text-xs text-neutral-400">Total Bookings Gross</span>
                <p className="text-xl font-bold text-emerald-400 mt-1">
                  ${(analytics.totalRevenueCents / 100).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg bg-neutral-900 p-3 border border-neutral-800">
                <span className="text-xs text-neutral-400">Maintenance & Equipment Spend</span>
                <p className="text-xl font-bold text-red-400 mt-1">
                  ${(analytics.totalMaintenanceSpendCents / 100).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg bg-neutral-900 p-3 border border-neutral-800">
                <span className="text-xs text-neutral-400">Net Floor Contribution</span>
                <p className="text-xl font-bold text-white mt-1">
                  ${((analytics.totalRevenueCents - analytics.totalMaintenanceSpendCents) / 100).toLocaleString()}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6 space-y-3 bg-muted/40 border-primary/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-white">Commercial Sponsor & Demographic Intelligence</h2>
                  <Badge variant="success" className="text-xs">
                    k ≥ 5 Guardrails
                  </Badge>
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Access aggregated footfall, demographic cohorts, and partner analytics with guaranteed k-anonymity privacy protection (Spec §8.6, §24.2).
                </p>
              </div>
              <Link href="/facility/sponsor">
                <Button variant="primary" size="sm">
                  Open Sponsor Portal
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      )}

      {/* MODAL 1: RESERVE COURT SLOT */}
      <Dialog
        open={isBookingOpen}
        onClose={() => setIsBookingOpen(false)}
        title="Reserve Court Floor Slot"
      >
        <div className="space-y-4">
          {bookingError && (
            <div className="rounded-lg bg-red-950/60 p-3 border border-red-800 text-xs text-red-200">
              {bookingError}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-neutral-300">Date</label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
              value={bookDate}
              onChange={(e) => setBookDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-neutral-300">Start Time</label>
              <input
                type="time"
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                value={bookStart}
                onChange={(e) => setBookStart(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-300">End Time</label>
              <input
                type="time"
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                value={bookEnd}
                onChange={(e) => setBookEnd(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-300">Purpose</label>
            <select
              aria-label="Reservation Purpose"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
              value={bookPurpose}
              onChange={(e) => setBookPurpose(e.target.value)}
            >
              <option value="TEAM_PRACTICE">Team Practice</option>
              <option value="LEAGUE_MATCH">Official League Match</option>
              <option value="PICKUP_RUN">Pickup Game / Open Run</option>
              <option value="TRAINING">Individual Athlete Training</option>
              <option value="COMMUNITY_EVENT">Community Clinic / Event</option>
              <option value="OTHER">Other Floor Use</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-300">Notes / Group Details (Optional)</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
              rows={2}
              placeholder="e.g. Bring official size 7 basketballs, scoreboard operator confirmed"
              value={bookNotes}
              onChange={(e) => setBookNotes(e.target.value)}
            />
          </div>

          <div className="rounded-lg bg-neutral-900/90 p-3 border border-neutral-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-neutral-400">Estimated Total Fee</span>
              <div className="text-xs text-neutral-500">Based on court operating schedule</div>
            </div>
            <span className="text-lg font-bold text-emerald-400">${estimatedCost.toFixed(2)}</span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsBookingOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => bookMutation.mutate()}
              disabled={bookMutation.isPending}
            >
              {bookMutation.isPending ? "Confirming..." : "Confirm Reservation"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* MODAL 2: LOG MAINTENANCE */}
      <Dialog
        open={isMaintenanceOpen}
        onClose={() => setIsMaintenanceOpen(false)}
        title="Log Facility Maintenance Event"
      >
        <div className="space-y-4">
          {maintError && (
            <div className="rounded-lg bg-red-950/60 p-3 border border-red-800 text-xs text-red-200">
              {maintError}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-neutral-300">Category</label>
            <select
              aria-label="Maintenance Category"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
              value={maintCategory}
              onChange={(e) => setMaintCategory(e.target.value)}
            >
              <option value="SURFACE_RESURFACING">Floor / Hardwood Resurfacing</option>
              <option value="RIM_REPLACEMENT">Rim / Breakaway Mechanism Replacement</option>
              <option value="NET_REPLACEMENT">Net Installation / Replacement</option>
              <option value="BACKBOARD_INSPECTION">Tempered Glass Backboard Inspection</option>
              <option value="LIGHTING_REPAIR">Arena Floodlighting / LED Repair</option>
              <option value="COURT_STRIPING">Court Line Re-striping (FIBA Geometry)</option>
              <option value="SAFETY_AUDIT">FIBA Pre-Tournament Safety Audit</option>
              <option value="GENERAL_CLEANING">General Deep Clean / Floor Degreasing</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-300">Severity Level</label>
            <select
              aria-label="Maintenance Severity"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
              value={maintSeverity}
              onChange={(e) => setMaintSeverity(e.target.value as "ROUTINE" | "RECOMMENDED" | "URGENT_SAFETY_HAZARD")}
            >
              <option value="ROUTINE">Routine Maintenance</option>
              <option value="RECOMMENDED">Recommended Improvement</option>
              <option value="URGENT_SAFETY_HAZARD">Urgent Safety Hazard</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-300">Work Description</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
              rows={3}
              placeholder="Detailed description of repairs, replaced hardware, technician notes..."
              value={maintDesc}
              onChange={(e) => setMaintDesc(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-neutral-300">Cost ($ USD)</label>
              <input
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                placeholder="150.00"
                value={maintCost}
                onChange={(e) => setMaintCost(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-300">Next Inspection Due</label>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                value={maintNextInspection}
                onChange={(e) => setMaintNextInspection(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsMaintenanceOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => maintenanceMutation.mutate()}
              disabled={maintenanceMutation.isPending || !maintDesc.trim()}
            >
              {maintenanceMutation.isPending ? "Saving..." : "Save Maintenance Record"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* MODAL 3: CLAIM FACILITY */}
      <Dialog
        open={isClaimOpen}
        onClose={() => setIsClaimOpen(false)}
        title="Claim Facility Ownership / Management"
      >
        <div className="space-y-4">
          {claimSuccess ? (
            <div className="space-y-3 py-2 text-center">
              <Badge variant="success">Claim Submitted</Badge>
              <h3 className="text-base font-bold text-white">Verification Request Sent</h3>
              <p className="text-xs text-neutral-300">
                Your facility claim for <strong>{currentCourt.name}</strong> has been submitted to the COURT IQ moderation queue. You will receive an email once approved.
              </p>
              <Button variant="primary" size="sm" onClick={() => setIsClaimOpen(false)}>
                Done
              </Button>
            </div>
          ) : (
            <>
              {claimError && (
                <div className="rounded-lg bg-red-950/60 p-3 border border-red-800 text-xs text-red-200">
                  {claimError}
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-neutral-300">Business / Organization Name</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                  placeholder="e.g. Brooklyn Youth Hoops Arena LLC"
                  value={claimBusinessName}
                  onChange={(e) => setClaimBusinessName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-300">Business Contact Email</label>
                <input
                  type="email"
                  className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                  placeholder="operator@brooklynhoops.org"
                  value={claimEmail}
                  onChange={(e) => setClaimEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-300">Phone Number (Optional)</label>
                <input
                  type="tel"
                  className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                  placeholder="+1 (718) 555-0199"
                  value={claimPhone}
                  onChange={(e) => setClaimPhone(e.target.value)}
                />
              </div>

              <div className="rounded-lg bg-neutral-900/90 p-3 border border-neutral-800 text-xs text-neutral-400">
                Claiming a facility grants you full access to manage operating hours, review reservation fees, and publish official safety maintenance logs.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setIsClaimOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => claimMutation.mutate()}
                  disabled={claimMutation.isPending || !claimBusinessName.trim() || !claimEmail.trim()}
                >
                  {claimMutation.isPending ? "Submitting..." : "Submit Claim"}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}

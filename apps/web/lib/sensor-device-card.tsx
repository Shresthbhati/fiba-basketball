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

export interface AthleteDeviceItem {
  id: string;
  userId: string;
  deviceManufacturer: "GARMIN" | "POLAR" | "CATAPULT" | "VERT" | "WITTY" | "APPLE" | "GENERIC_IMU";
  deviceModel: string;
  deviceIdentifier: string | null;
  firmwareVersion: string | null;
  calibrationDate: string | null;
  status: "ACTIVE" | "RETIRED" | "DISCONNECTED";
  createdAt: string;
}

export interface SensorSessionItem {
  id: string;
  sessionName: string;
  sessionType: "MATCH" | "PRACTICE" | "WORKOUT" | "RECOVERY" | "COMBINE" | "DRILL";
  sourceType: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  distanceMeters: number | null;
  playerLoad: number | null;
  jumpCount: number | null;
  maxJumpHeightCm: number | null;
  avgHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  timeInZoneSeconds: {
    z1?: number;
    z2?: number;
    z3?: number;
    z4?: number;
    z5?: number;
  } | null;
  deviceManufacturer: string;
  deviceModel: string;
  createdAt: string;
}

export function SensorDeviceCard() {
  const qc = useQueryClient();
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("ALL");

  // Device registration state
  const [manufacturer, setManufacturer] = useState<AthleteDeviceItem["deviceManufacturer"]>("GARMIN");
  const [model, setModel] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [firmware, setFirmware] = useState("");
  const [regError, setRegError] = useState<string | null>(null);

  // Queries
  const {
    data: devicesData,
    isLoading: devicesLoading,
    isError: devicesError,
    refetch: refetchDevices,
  } = useQuery<{ items: AthleteDeviceItem[] }>({
    queryKey: ["athlete-devices"],
    queryFn: async () => api<{ items: AthleteDeviceItem[] }>("/devices"),
  });

  const {
    data: sessionsData,
    isLoading: sessionsLoading,
    isError: sessionsError,
    refetch: refetchSessions,
  } = useQuery<{ items: SensorSessionItem[]; complianceNotice: string }>({
    queryKey: ["sensor-sessions", selectedTypeFilter],
    queryFn: async () => {
      const q = selectedTypeFilter !== "ALL" ? `?sessionType=${selectedTypeFilter}` : "";
      return api<{ items: SensorSessionItem[]; complianceNotice: string }>(`/athletes/me/sensor-sessions${q}`);
    },
  });

  // Mutations
  const registerMutation = useMutation({
    mutationFn: async () => {
      return api<AthleteDeviceItem>("/devices", {
        method: "POST",
        body: JSON.stringify({
          deviceManufacturer: manufacturer,
          deviceModel: model.trim(),
          deviceIdentifier: identifier.trim() || undefined,
          firmwareVersion: firmware.trim() || undefined,
        }),
      });
    },
    onSuccess: () => {
      setIsRegisterOpen(false);
      setModel("");
      setIdentifier("");
      setFirmware("");
      setRegError(null);
      void qc.invalidateQueries({ queryKey: ["athlete-devices"] });
    },
    onError: (err: Error) => {
      setRegError(err.message || "Failed to register device.");
    },
  });

  const retireMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      return api(`/devices/${deviceId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["athlete-devices"] });
    },
  });

  const devices = devicesData?.items ?? [];
  const sessions = sessionsData?.items ?? [];
  const activeDevices = devices.filter((d) => d.status === "ACTIVE");

  return (
    <div style={{ display: "grid", gap: "2rem" }}>
      {/* Header & Device Registry */}
      <Card style={{ padding: "1.5rem", display: "grid", gap: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>Wearable & Sensor Devices</h2>
            <p style={{ margin: "0.25rem 0 0", color: "var(--muted, #94a3b8)", fontSize: "0.875rem" }}>
              Connect IMUs, optical timing gates, jump mats, and heart rate sensors (Garmin, Polar, Catapult, VERT, Witty).
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button variant="secondary" size="sm" onClick={() => setIsImportOpen(true)} disabled={activeDevices.length === 0}>
              Import Telemetry
            </Button>
            <Button variant="primary" size="sm" onClick={() => setIsRegisterOpen(true)}>
              + Connect Device
            </Button>
          </div>
        </div>

        {/* Compliance Banner */}
        <div
          role="note"
          style={{
            background: "rgba(59, 130, 246, 0.08)",
            border: "1px solid rgba(59, 130, 246, 0.25)",
            padding: "0.625rem 0.875rem",
            borderRadius: "6px",
            fontSize: "0.8125rem",
            color: "#93c5fd",
            lineHeight: 1.4,
          }}
        >
          <strong>ADR-0009 & ADR-0015 COMPLIANT:</strong> All device telemetry is classified as <code>SourceType.SENSOR</code>. Metrics are descriptive and correlational only. COURT IQ never outputs injury probabilities or medical diagnoses.
        </div>

        {/* Device List */}
        {devicesLoading && <LoadingState message="Loading connected devices..." />}
        {devicesError && (
          <ErrorState
            title="Failed to load devices"
            message="Please verify your network connection and try again."
            onRetry={() => void refetchDevices()}
          />
        )}
        {!devicesLoading && !devicesError && devices.length === 0 && (
          <EmptyState
            title="No devices connected"
            description="Register your wearable IMU, optical timing gate, or heart rate monitor to begin ingesting mechanical load telemetry."
          />
        )}

        {!devicesLoading && !devicesError && devices.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.75rem" }}>
            {devices.map((dev) => (
              <div
                key={dev.id}
                style={{
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                  borderRadius: "8px",
                  padding: "0.875rem",
                  background: "rgba(0, 0, 0, 0.15)",
                  display: "grid",
                  gap: "0.5rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.9375rem" }}>{dev.deviceModel}</span>
                  <Badge variant={dev.status === "ACTIVE" ? "success" : "neutral"} size="sm">
                    {dev.status}
                  </Badge>
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--muted, #94a3b8)" }}>
                  <div>Manufacturer: <strong>{dev.deviceManufacturer}</strong></div>
                  {dev.firmwareVersion && <div>Firmware: {dev.firmwareVersion}</div>}
                  {dev.deviceIdentifier && <div>SN: {dev.deviceIdentifier}</div>}
                </div>
                {dev.status === "ACTIVE" && (
                  <div style={{ marginTop: "0.25rem", display: "flex", justifyContent: "flex-end" }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => retireMutation.mutate(dev.id)}
                      disabled={retireMutation.isPending}
                    >
                      Disconnect
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Sensor Telemetry Sessions */}
      <div style={{ display: "grid", gap: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>Sensor Telemetry Activity Log</h3>
            <p style={{ margin: "0.25rem 0 0", color: "var(--muted, #94a3b8)", fontSize: "0.8125rem" }}>
              Mechanical load, sprint kinematics, jump counts, and cardiovascular zones from calibrated hardware.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {(["ALL", "PRACTICE", "MATCH", "WORKOUT", "RECOVERY"] as const).map((tab) => (
              <Button
                key={tab}
                variant={selectedTypeFilter === tab ? "primary" : "secondary"}
                size="sm"
                onClick={() => setSelectedTypeFilter(tab)}
              >
                {tab.charAt(0) + tab.slice(1).toLowerCase()}
              </Button>
            ))}
          </div>
        </div>

        {sessionsLoading && <LoadingState message="Loading telemetry sessions..." />}
        {sessionsError && (
          <ErrorState
            title="Failed to load telemetry"
            message="Please verify your network connection and try again."
            onRetry={() => void refetchSessions()}
          />
        )}
        {!sessionsLoading && !sessionsError && sessions.length === 0 && (
          <EmptyState
            title="No telemetry sessions logged"
            description={
              selectedTypeFilter === "ALL"
                ? "Import sensor activity files or sync a connected device to populate mechanical load data."
                : `No ${selectedTypeFilter.toLowerCase()} telemetry sessions recorded.`
            }
          />
        )}

        {!sessionsLoading && !sessionsError && sessions.length > 0 && (
          <div style={{ display: "grid", gap: "1rem" }}>
            {sessions.map((sess) => {
              const minutes = Math.round(sess.durationSeconds / 60);

              return (
                <Card key={sess.id} style={{ padding: "1.25rem", display: "grid", gap: "0.875rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "1.0625rem", fontWeight: 700 }}>{sess.sessionName}</span>
                        <Badge variant="brand" size="sm">
                          {sess.sessionType}
                        </Badge>
                        <Badge variant="info" size="sm">
                          SENSOR
                        </Badge>
                        <Badge variant="neutral" size="sm">
                          {sess.deviceManufacturer} {sess.deviceModel}
                        </Badge>
                      </div>
                      <div style={{ fontSize: "0.8125rem", color: "var(--muted, #94a3b8)", marginTop: "0.25rem" }}>
                        Logged on {new Date(sess.startedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} • Duration: {minutes} mins
                      </div>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                      gap: "0.625rem",
                      background: "rgba(0, 0, 0, 0.2)",
                      padding: "0.75rem",
                      borderRadius: "6px",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--muted, #94a3b8)" }}>PlayerLoad</div>
                      <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "#f97316" }}>
                        {sess.playerLoad !== null ? `${sess.playerLoad} AU` : "—"}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--muted, #94a3b8)" }}>Jump Count</div>
                      <div style={{ fontSize: "1.125rem", fontWeight: 700 }}>
                        {sess.jumpCount !== null ? sess.jumpCount : "—"}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--muted, #94a3b8)" }}>Max Jump Height</div>
                      <div style={{ fontSize: "1.125rem", fontWeight: 700 }}>
                        {sess.maxJumpHeightCm !== null ? `${sess.maxJumpHeightCm} cm` : "—"}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--muted, #94a3b8)" }}>Distance</div>
                      <div style={{ fontSize: "1.125rem", fontWeight: 700 }}>
                        {sess.distanceMeters !== null ? `${(sess.distanceMeters / 1000).toFixed(2)} km` : "—"}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--muted, #94a3b8)" }}>Avg / Max Heart Rate</div>
                      <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "#ef4444" }}>
                        {sess.avgHeartRateBpm !== null ? `${sess.avgHeartRateBpm} / ${sess.maxHeartRateBpm ?? "—"} bpm` : "—"}
                      </div>
                    </div>
                  </div>

                  {/* Heart Rate Zones Bar if present */}
                  {sess.timeInZoneSeconds && (
                    <div style={{ display: "grid", gap: "0.25rem" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--muted, #94a3b8)" }}>Heart Rate Zone Time Distribution (Z1–Z5)</div>
                      <div style={{ display: "flex", height: "10px", borderRadius: "4px", overflow: "hidden", background: "rgba(255, 255, 255, 0.05)" }}>
                        <div style={{ width: `${Math.min(((sess.timeInZoneSeconds.z1 ?? 0) / sess.durationSeconds) * 100, 100)}%`, background: "#94a3b8" }} title="Zone 1 (Warmup)" />
                        <div style={{ width: `${Math.min(((sess.timeInZoneSeconds.z2 ?? 0) / sess.durationSeconds) * 100, 100)}%`, background: "#3b82f6" }} title="Zone 2 (Aerobic Base)" />
                        <div style={{ width: `${Math.min(((sess.timeInZoneSeconds.z3 ?? 0) / sess.durationSeconds) * 100, 100)}%`, background: "#10b981" }} title="Zone 3 (Tempo)" />
                        <div style={{ width: `${Math.min(((sess.timeInZoneSeconds.z4 ?? 0) / sess.durationSeconds) * 100, 100)}%`, background: "#f59e0b" }} title="Zone 4 (Threshold)" />
                        <div style={{ width: `${Math.min(((sess.timeInZoneSeconds.z5 ?? 0) / sess.durationSeconds) * 100, 100)}%`, background: "#ef4444" }} title="Zone 5 (Max Capacity)" />
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Register Device Dialog */}
      {isRegisterOpen && (
        <Dialog
          open={true}
          onClose={() => setIsRegisterOpen(false)}
          title="Connect Wearable / Sensor Device"
          description="Register external athletic tracking hardware for automatic data ingestion."
          actions={
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setIsRegisterOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!model.trim() || registerMutation.isPending}
                onClick={() => registerMutation.mutate()}
              >
                {registerMutation.isPending ? "Connecting..." : "Save Device"}
              </Button>
            </div>
          }
        >
          <div style={{ display: "grid", gap: "0.875rem", marginTop: "0.5rem" }}>
            {regError && (
              <div role="alert" style={{ color: "#ef4444", fontSize: "0.875rem", background: "rgba(239, 68, 68, 0.1)", padding: "0.5rem", borderRadius: "4px" }}>
                {regError}
              </div>
            )}
            <div>
              <label htmlFor="dev-mfg" style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                Manufacturer
              </label>
              <Select
                id="dev-mfg"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value as AthleteDeviceItem["deviceManufacturer"])}
              >
                <option value="GARMIN">Garmin</option>
                <option value="POLAR">Polar</option>
                <option value="CATAPULT">Catapult</option>
                <option value="VERT">VERT Jump Monitor</option>
                <option value="WITTY">Witty Timing Gates</option>
                <option value="APPLE">Apple Watch</option>
                <option value="GENERIC_IMU">Generic IMU / Sensor</option>
              </Select>
            </div>

            <div>
              <label htmlFor="dev-model" style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                Device Model Name
              </label>
              <Input
                id="dev-model"
                placeholder="E.g. Vector S7, H10, Forerunner 965"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div>
                <label htmlFor="dev-sn" style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  Device Serial / Identifier
                </label>
                <Input
                  id="dev-sn"
                  placeholder="Optional ID"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="dev-fw" style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  Firmware Version
                </label>
                <Input
                  id="dev-fw"
                  placeholder="E.g. v2.1.0"
                  value={firmware}
                  onChange={(e) => setFirmware(e.target.value)}
                />
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* Import Telemetry Modal */}
      {isImportOpen && (
        <SensorImportModal
          devices={activeDevices}
          isOpen={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          onSuccess={() => {
            setIsImportOpen(false);
            void qc.invalidateQueries({ queryKey: ["sensor-sessions"] });
          }}
        />
      )}
    </div>
  );
}

export interface SensorImportModalProps {
  devices: AthleteDeviceItem[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function SensorImportModal({
  devices,
  isOpen,
  onClose,
  onSuccess,
}: SensorImportModalProps) {
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? "");
  const [sessionName, setSessionName] = useState("Full Court Scrimmage");
  const [sessionType, setSessionType] = useState<SensorSessionItem["sessionType"]>("PRACTICE");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [playerLoad, setPlayerLoad] = useState("380");
  const [jumpCount, setJumpCount] = useState("28");
  const [avgHeartRate, setAvgHeartRate] = useState("152");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeDeviceId = deviceId || (devices[0]?.id ?? "");

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!activeDeviceId) {
      setErrorMsg("Please select a device to attribute this telemetry.");
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      const mins = Number(durationMinutes) || 60;
      const started = new Date(now.getTime() - mins * 60_000);

      await api(`/devices/${activeDeviceId}/telemetry`, {
        method: "POST",
        body: JSON.stringify({
          sessionName: sessionName.trim(),
          sessionType,
          startedAt: started.toISOString(),
          endedAt: now.toISOString(),
          durationSeconds: mins * 60,
          playerLoad: Number(playerLoad) || 0,
          jumpCount: Number(jumpCount) || 0,
          avgHeartRateBpm: Number(avgHeartRate) || undefined,
          rawFormat: "JSON",
        }),
      });

      onSuccess();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to import telemetry session.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Import Sensor Activity Session"
      description="Ingest telemetry from wearable IMU, heart rate monitor, or timing gates."
      actions={
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleImport} disabled={isSubmitting || devices.length === 0}>
            {isSubmitting ? "Importing..." : "Ingest Telemetry"}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleImport} style={{ display: "grid", gap: "0.875rem", marginTop: "0.5rem" }}>
        {errorMsg && (
          <div role="alert" style={{ color: "#ef4444", fontSize: "0.875rem", background: "rgba(239, 68, 68, 0.1)", padding: "0.5rem", borderRadius: "4px" }}>
            {errorMsg}
          </div>
        )}

        <div>
          <label htmlFor="import-dev" style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>
            Source Device
          </label>
          <Select
            id="import-dev"
            value={activeDeviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.deviceManufacturer} — {d.deviceModel}
              </option>
            ))}
          </Select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem" }}>
          <div>
            <label htmlFor="import-name" style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>
              Session Name
            </label>
            <Input
              id="import-name"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="import-type" style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>
              Type
            </label>
            <Select
              id="import-type"
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value as SensorSessionItem["sessionType"])}
            >
              <option value="PRACTICE">Practice</option>
              <option value="MATCH">Match</option>
              <option value="WORKOUT">Workout</option>
              <option value="COMBINE">Combine</option>
              <option value="RECOVERY">Recovery</option>
            </Select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.5rem" }}>
          <div>
            <label htmlFor="import-dur" style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
              Duration (m)
            </label>
            <Input
              id="import-dur"
              type="number"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="import-load" style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
              PlayerLoad
            </label>
            <Input
              id="import-load"
              type="number"
              value={playerLoad}
              onChange={(e) => setPlayerLoad(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="import-jumps" style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
              Jumps
            </label>
            <Input
              id="import-jumps"
              type="number"
              value={jumpCount}
              onChange={(e) => setJumpCount(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="import-hr" style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
              Avg BPM
            </label>
            <Input
              id="import-hr"
              type="number"
              value={avgHeartRate}
              onChange={(e) => setAvgHeartRate(e.target.value)}
            />
          </div>
        </div>
      </form>
    </Dialog>
  );
}

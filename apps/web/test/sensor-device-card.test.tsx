import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  SensorDeviceCard,
  SensorImportModal,
  type AthleteDeviceItem,
  type SensorSessionItem,
} from "../lib/sensor-device-card";
import * as apiModule from "../lib/api";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockDevices: AthleteDeviceItem[] = [
  {
    id: "dev-001",
    userId: "user-123",
    deviceManufacturer: "CATAPULT",
    deviceModel: "Vector S7",
    deviceIdentifier: "CAT-8921",
    firmwareVersion: "v4.1.2",
    calibrationDate: "2026-10-01T00:00:00Z",
    status: "ACTIVE",
    createdAt: "2026-10-01T12:00:00Z",
  },
  {
    id: "dev-002",
    userId: "user-123",
    deviceManufacturer: "POLAR",
    deviceModel: "H10",
    deviceIdentifier: "POL-994",
    firmwareVersion: null,
    calibrationDate: null,
    status: "ACTIVE",
    createdAt: "2026-10-05T12:00:00Z",
  },
];

const mockSessions: SensorSessionItem[] = [
  {
    id: "sess-001",
    sessionName: "Scrimmage High-Intensity Run",
    sessionType: "PRACTICE",
    sourceType: "SENSOR",
    startedAt: "2026-10-24T18:00:00Z",
    endedAt: "2026-10-24T19:00:00Z",
    durationSeconds: 3600,
    distanceMeters: 5200,
    playerLoad: 412.5,
    jumpCount: 34,
    maxJumpHeightCm: 84.2,
    avgHeartRateBpm: 156,
    maxHeartRateBpm: 188,
    timeInZoneSeconds: {
      z1: 200,
      z2: 500,
      z3: 1100,
      z4: 1200,
      z5: 600,
    },
    deviceManufacturer: "CATAPULT",
    deviceModel: "Vector S7",
    createdAt: "2026-10-24T19:05:00Z",
  },
];

describe("SensorDeviceCard Component (WP-6.4, ADR-0015)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders connected devices, telemetry sessions, and ADR-0009 compliance notice", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (path) => {
      if (path === "/devices") return { items: mockDevices };
      if (typeof path === "string" && path.startsWith("/athletes/me/sensor-sessions")) {
        return { items: mockSessions, complianceNotice: "ADR-0009 COMPLIANT: Descriptive sensor telemetry only." };
      }
      return {};
    });

    renderWithClient(<SensorDeviceCard />);

    expect(screen.getByText("Wearable & Sensor Devices")).toBeDefined();
    expect(await screen.findByText("Vector S7")).toBeDefined();
    expect(screen.getByText("H10")).toBeDefined();
    expect(screen.getByText(/ADR-0009 & ADR-0015 COMPLIANT/)).toBeDefined();

    expect(await screen.findByText("Scrimmage High-Intensity Run")).toBeDefined();
    expect(screen.getByText("412.5 AU")).toBeDefined();
    expect(screen.getByText("34")).toBeDefined();
    expect(screen.getByText("84.2 cm")).toBeDefined();
    expect(screen.getByText(/156 \/ 188 bpm/)).toBeDefined();
  });

  it("allows registering a new device via dialog form", async () => {
    let postBody: unknown = null;
    vi.spyOn(apiModule, "api").mockImplementation(async (path, init) => {
      if (path === "/devices" && init?.method === "POST") {
        postBody = JSON.parse(init.body as string);
        return { id: "dev-003", deviceManufacturer: "GARMIN", deviceModel: "Forerunner 965", status: "ACTIVE" };
      }
      if (path === "/devices") return { items: mockDevices };
      if (typeof path === "string" && path.startsWith("/athletes/me/sensor-sessions")) {
        return { items: mockSessions };
      }
      return {};
    });

    renderWithClient(<SensorDeviceCard />);

    const connectBtn = await screen.findByText("+ Connect Device");
    fireEvent.click(connectBtn);

    expect(screen.getByText("Connect Wearable / Sensor Device")).toBeDefined();

    const modelInput = screen.getByLabelText(/Device Model Name/);
    fireEvent.change(modelInput, { target: { value: "Forerunner 965" } });

    const saveBtn = screen.getByText("Save Device");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(postBody).toMatchObject({
        deviceManufacturer: "GARMIN",
        deviceModel: "Forerunner 965",
      });
    });
  });

  it("allows retiring an active device", async () => {
    let deletedPath = "";
    vi.spyOn(apiModule, "api").mockImplementation(async (path, init) => {
      if (typeof path === "string" && path.startsWith("/devices/dev-001") && init?.method === "DELETE") {
        deletedPath = path;
        return { id: "dev-001", status: "RETIRED" };
      }
      if (path === "/devices") return { items: mockDevices };
      if (typeof path === "string" && path.startsWith("/athletes/me/sensor-sessions")) {
        return { items: mockSessions };
      }
      return {};
    });

    renderWithClient(<SensorDeviceCard />);

    const disconnectBtns = await screen.findAllByText("Disconnect");
    expect(disconnectBtns.length).toBeGreaterThan(0);
    fireEvent.click(disconnectBtns[0]!);

    await waitFor(() => {
      expect(deletedPath).toBe("/devices/dev-001");
    });
  });

  it("renders SensorImportModal and imports a telemetry activity session", async () => {
    let submittedPayload: unknown = null;
    vi.spyOn(apiModule, "api").mockImplementation(async (path, init) => {
      if (typeof path === "string" && path.startsWith("/devices/dev-001/telemetry") && init?.method === "POST") {
        submittedPayload = JSON.parse(init.body as string);
        return { id: "sess-999", sessionName: "Shootaround Run", status: "INGESTED" };
      }
      return {};
    });

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    renderWithClient(
      <SensorImportModal
        devices={mockDevices}
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    expect(screen.getByText("Import Sensor Activity Session")).toBeDefined();

    const nameInput = screen.getByLabelText(/Session Name/);
    fireEvent.change(nameInput, { target: { value: "Evening 5v5 Run" } });

    const submitBtn = screen.getByText("Ingest Telemetry");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });

    expect(submittedPayload).toMatchObject({
      sessionName: "Evening 5v5 Run",
      sessionType: "PRACTICE",
    });
  });
});

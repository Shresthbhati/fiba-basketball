import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  NotificationPreferencesCard,
  type NotificationPreferences,
  type TestDispatchResponse,
} from "../lib/notification-preferences-card";
import * as apiModule from "../lib/api";

const mockPrefs: NotificationPreferences = {
  userId: "user-1",
  webPushEnabled: true,
  emailEnabled: true,
  gameInvites: true,
  courtAlerts: true,
  teamAnnouncements: true,
  quietHoursEnabled: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  quietHoursTimezone: "UTC",
  dailyCap: 10,
  deliveredPast24h: 3,
  inQuietHours: false,
  isCapped: false,
};

describe("NotificationPreferencesCard Component (Spec §11.4, WP-5.1)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders preferences form with quiet hours and 24-hour volume gauge", async () => {
    vi.spyOn(apiModule, "api").mockResolvedValueOnce(mockPrefs as never);

    render(<NotificationPreferencesCard />);

    await waitFor(() => {
      expect(screen.getByText(/Notification Delivery & Quiet Hours/i)).toBeDefined();
      expect(screen.getByText("3 / 10 sent")).toBeDefined();
      expect(screen.getByText("☀️ Normal Delivery Active")).toBeDefined();
      expect(screen.getByRole("button", { name: "Save Preferences" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Send Test Notification" })).toBeDefined();
    });
  });

  it("updates preferences via PUT /notifications/preferences and displays success alert", async () => {
    vi.spyOn(apiModule, "api")
      .mockResolvedValueOnce(mockPrefs as never) // GET on mount
      .mockResolvedValueOnce({
        ...mockPrefs,
        quietHoursStart: "23:00",
        quietHoursEnd: "07:00",
      } as never) // PUT
      .mockResolvedValueOnce({
        ...mockPrefs,
        quietHoursStart: "23:00",
        quietHoursEnd: "07:00",
      } as never); // GET refresh

    render(<NotificationPreferencesCard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save Preferences" })).toBeDefined();
    });

    // Change start quiet hours
    fireEvent.change(screen.getByPlaceholderText("22:00"), {
      target: { value: "23:00" },
    });

    // Submit form
    fireEvent.click(screen.getByRole("button", { name: "Save Preferences" }));

    await waitFor(() => {
      expect(screen.getByText("Notification preferences saved successfully!")).toBeDefined();
    });
  });

  it("sends test dispatch and renders delivered verdict banner", async () => {
    const testResult: TestDispatchResponse = {
      delivered: true,
      suppressionReason: null,
      channel: "PUSH",
      kind: "GAME_INVITE",
      timestamp: new Date().toISOString(),
    };

    vi.spyOn(apiModule, "api")
      .mockResolvedValueOnce(mockPrefs as never) // GET on mount
      .mockResolvedValueOnce(testResult as never) // POST test-dispatch
      .mockResolvedValueOnce(mockPrefs as never); // GET refresh

    render(<NotificationPreferencesCard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Send Test Notification" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Send Test Notification" }));

    await waitFor(() => {
      expect(screen.getByText("✅ Test Notification Delivered Successfully")).toBeDefined();
      expect(screen.getByText("Push signal passed all rate caps and quiet hours checks.")).toBeDefined();
    });
  });

  it("renders quiet hours suppression explanation when test dispatch is blocked", async () => {
    const testResult: TestDispatchResponse = {
      delivered: false,
      suppressionReason: "QUIET_HOURS",
      channel: "PUSH",
      kind: "GAME_INVITE",
      timestamp: new Date().toISOString(),
    };

    vi.spyOn(apiModule, "api")
      .mockResolvedValueOnce({ ...mockPrefs, inQuietHours: true } as never) // GET on mount
      .mockResolvedValueOnce(testResult as never) // POST test-dispatch
      .mockResolvedValueOnce({ ...mockPrefs, inQuietHours: true } as never); // GET refresh

    render(<NotificationPreferencesCard />);

    await waitFor(() => {
      expect(screen.getByText("🌙 Quiet Hours Active")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Send Test Notification" }));

    await waitFor(() => {
      expect(screen.getByText("⏸️ Test Notification Suppressed (QUIET_HOURS)")).toBeDefined();
      expect(
        screen.getByText(
          "Delivery suppressed because current time is within your overnight quiet hours window."
        )
      ).toBeDefined();
    });
  });
});

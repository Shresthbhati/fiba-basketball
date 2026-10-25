import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TotpSettingsCard } from "../lib/totp-settings-card";
import * as apiModule from "../lib/api";

describe("TotpSettingsCard Component (Spec §1.1, §2.2, WP-1.1)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders disabled status and initiates setup flow with recovery codes", async () => {
    vi.spyOn(apiModule, "api")
      .mockResolvedValueOnce({ enabled: false, verifiedAt: null }) // GET /auth/totp/status
      .mockResolvedValueOnce({
        secret: "JBSWY3DPEHPK3PXP",
        uri: "otpauth://totp/COURT%20IQ:test@example.com?secret=JBSWY3DPEHPK3PXP",
        recoveryCodes: ["code-1111", "code-2222"],
      }) // POST /auth/totp/setup
      .mockResolvedValueOnce({ ok: true }) // POST /auth/totp/enable
      .mockResolvedValueOnce({ enabled: true, verifiedAt: new Date().toISOString() }); // GET status after enable

    render(<TotpSettingsCard />);

    await waitFor(() => {
      expect(screen.getByText("DISABLED")).toBeDefined();
      expect(screen.getByRole("button", { name: "Set Up Two-Factor Authentication" })).toBeDefined();
    });

    // Click setup
    fireEvent.click(screen.getByRole("button", { name: "Set Up Two-Factor Authentication" }));

    await waitFor(() => {
      expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeDefined();
      expect(screen.getByText("code-1111")).toBeDefined();
      expect(screen.getByText("code-2222")).toBeDefined();
    });

    // Enter verification code and submit
    fireEvent.change(screen.getByPlaceholderText("123456"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Activate" }));

    await waitFor(() => {
      expect(screen.getByText("Two-Factor Authentication activated successfully!")).toBeDefined();
    });
  });

  it("renders active status and provides disable modal", async () => {
    vi.spyOn(apiModule, "api")
      .mockResolvedValueOnce({ enabled: true, verifiedAt: "2026-10-25T12:00:00Z" })
      .mockResolvedValueOnce({ ok: true }) // POST /auth/totp/disable
      .mockResolvedValueOnce({ enabled: false, verifiedAt: null });

    render(<TotpSettingsCard />);

    await waitFor(() => {
      expect(screen.getByText("ACTIVE")).toBeDefined();
      expect(screen.getByRole("button", { name: "Disable Two-Factor Authentication" })).toBeDefined();
    });

    // Open disable form
    fireEvent.click(screen.getByRole("button", { name: "Disable Two-Factor Authentication" }));

    expect(screen.getByText("Confirm Disabling Two-Factor Authentication")).toBeDefined();
    expect(screen.getByLabelText("Account Password")).toBeDefined();

    fireEvent.change(screen.getByLabelText("Account Password"), { target: { value: "my-password" } });
    fireEvent.change(screen.getByLabelText(/Current Authenticator Code/), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Disable" }));

    await waitFor(() => {
      expect(screen.getByText("Two-Factor Authentication disabled.")).toBeDefined();
    });
  });
});

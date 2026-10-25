import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PrivacySettingsCard, type PrivacyStatusResponse, type ExportArchiveResponse } from "../lib/privacy-settings-card";
import * as apiModule from "../lib/api";

const mockStatus: PrivacyStatusResponse = {
  userId: "user-123",
  isErased: false,
  erasedAt: null,
  dataRetentionDays: 30,
  hasActiveExport: false,
  latestExport: null,
};

const mockExportArchive: ExportArchiveResponse = {
  id: "export-1",
  status: "READY",
  checksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  expiresAt: "2026-11-01T12:00:00Z",
  createdAt: "2026-10-25T12:00:00Z",
  archive: {
    profile: { email: "player@example.com", displayName: "Devin Booker" },
    roles: [{ role: "ATHLETE" }],
    athleticTesting: [],
  },
};

describe("PrivacySettingsCard Component (Spec §1.4, §24.4, WP-1.4, WP-1.1)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders privacy governance headers, articles explainer, and export actions", async () => {
    vi.spyOn(apiModule, "api").mockResolvedValueOnce(mockStatus as never);

    render(<PrivacySettingsCard />);

    await waitFor(() => {
      expect(screen.getByText(/Privacy & Data Rights Governance/i)).toBeDefined();
      expect(screen.getByText("GDPR & CCPA Compliant")).toBeDefined();
      expect(screen.getByText(/Right to Access & Data Portability/i)).toBeDefined();
      expect(screen.getByText(/Right to Erasure & Account Scrub/i)).toBeDefined();
      expect(screen.getByRole("button", { name: "Export Data Archive (JSON)" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Request Permanent Account Erasure" })).toBeDefined();
    });
  });

  it("generates data archive, displays SHA-256 integrity checksum, and provides download button", async () => {
    vi.spyOn(apiModule, "api")
      .mockResolvedValueOnce(mockStatus as never)
      .mockResolvedValueOnce(mockExportArchive as never)
      .mockResolvedValueOnce({
        ...mockStatus,
        hasActiveExport: true,
        latestExport: {
          id: mockExportArchive.id,
          checksumSha256: mockExportArchive.checksumSha256,
          createdAt: mockExportArchive.createdAt,
          expiresAt: mockExportArchive.expiresAt,
        },
      } as never);

    render(<PrivacySettingsCard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Export Data Archive (JSON)" })).toBeDefined();
    });

    // Click Export
    fireEvent.click(screen.getByRole("button", { name: "Export Data Archive (JSON)" }));

    await waitFor(() => {
      expect(screen.getByText("Your personal data archive was generated successfully!")).toBeDefined();
      expect(screen.getByText(mockExportArchive.checksumSha256)).toBeDefined();
      expect(screen.getByRole("button", { name: "⬇ Download .json File" })).toBeDefined();
    });
  });

  it("opens account erasure modal, confirms password, and displays tombstoning notice", async () => {
    vi.spyOn(apiModule, "api")
      .mockResolvedValueOnce(mockStatus as never)
      .mockResolvedValueOnce({
        ok: true,
        message: "Your account and personal data have been erased. Official match scorebooks retain [Former Member] per FIBA record integrity.",
      } as never);

    render(<PrivacySettingsCard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Request Permanent Account Erasure" })).toBeDefined();
    });

    // Open modal
    fireEvent.click(screen.getByRole("button", { name: "Request Permanent Account Erasure" }));

    expect(screen.getByText("Confirm Irreversible Account Erasure")).toBeDefined();

    // Enter password
    fireEvent.change(screen.getByPlaceholderText("Enter your current password"), {
      target: { value: "SecretPassword123!" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. Relocating, no longer playing competitive basketball..."), {
      target: { value: "Retiring from competitive basketball" },
    });

    // Submit erasure
    fireEvent.click(screen.getByRole("button", { name: "Permanently Erase My Account" }));

    await waitFor(() => {
      expect(screen.getByText("Account & Data Erased")).toBeDefined();
      expect(screen.getByText(/Official match scorebooks retain \[Former Member\]/i)).toBeDefined();
      expect(screen.getByText("Redirecting to home page…")).toBeDefined();
    });
  });
});

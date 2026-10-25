import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ModerationConsole, type ModerationCaseItem, type CaseDetail, type AuditLogEntry } from "../lib/moderation-console";

describe("ModerationConsole Component (Spec §15.2, §23)", () => {
  const sampleCases: ModerationCaseItem[] = [
    {
      id: "case-001-uuid-1111",
      targetType: "USER",
      targetId: "user-target-123",
      status: "OPEN",
      reportCount: 3,
      createdAt: "2026-10-24T12:00:00.000Z",
    },
    {
      id: "case-002-uuid-2222",
      targetType: "COURT",
      targetId: "court-target-456",
      status: "RESOLVED",
      reportCount: 1,
      createdAt: "2026-10-24T10:00:00.000Z",
    },
  ];

  it("renders open cases queue with report counts and status filters", () => {
    render(<ModerationConsole initialCases={sampleCases} />);

    expect(screen.getByText(/Trust & Safety Moderation Console/i)).toBeDefined();
    expect(screen.getByText(/Cases Queue \(1 Open\)/i)).toBeDefined();
    expect(screen.getByText(/Target: USER/i)).toBeDefined();
    expect(screen.getByText(/Reports Filed:/i)).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
  });

  it("requires minimum 8-character audit reason to inspect sensitive case details", async () => {
    const handleInspect = vi.fn().mockResolvedValue({
      id: "case-001-uuid-1111",
      targetType: "USER",
      targetId: "user-target-123",
      status: "OPEN",
      reportCount: 3,
      createdAt: "2026-10-24T12:00:00.000Z",
      reports: [
        {
          reporterId: "rep-1",
          reason: "HARASSMENT",
          note: "Hostile unsportsmanlike behavior on court.",
          createdAt: "2026-10-24T12:05:00.000Z",
        },
      ],
    } satisfies CaseDetail);

    render(
      <ModerationConsole
        initialCases={sampleCases}
        onInspectCase={handleInspect}
      />
    );

    const inspectBtn = screen.getByRole("button", { name: /Inspect & Action/i });
    fireEvent.click(inspectBtn);

    expect(screen.getByText(/Case Inspection: #case-001/i)).toBeDefined();

    const reasonInput = screen.getByLabelText(/Audit Justification Reason/i);
    const submitBtn = screen.getByRole("button", { name: /Authorize & View Reports/i });

    // Submit with too short reason (less than 8 chars)
    fireEvent.change(reasonInput, { target: { value: "short" } });
    fireEvent.click(submitBtn);
    expect(handleInspect).not.toHaveBeenCalled();

    // Submit with valid audit reason
    fireEvent.change(reasonInput, { target: { value: "Investigating reported harassment on court" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleInspect).toHaveBeenCalledWith("case-001-uuid-1111", "Investigating reported harassment on court");
      expect(screen.getByText(/Community Reports \(1\)/i)).toBeDefined();
      expect(screen.getByText(/Hostile unsportsmanlike behavior on court/i)).toBeDefined();
    });
  });

  it("resolves open case and updates status pill", async () => {
    const handleInspect = vi.fn().mockResolvedValue({
      id: "case-001-uuid-1111",
      targetType: "USER",
      targetId: "user-target-123",
      status: "OPEN",
      reportCount: 3,
      createdAt: "2026-10-24T12:00:00.000Z",
      reports: [{ reporterId: "rep-1", reason: "HARASSMENT", note: "Rude notes", createdAt: "2026-10-24" }],
    } satisfies CaseDetail);

    const handleResolve = vi.fn().mockResolvedValue(undefined);

    render(
      <ModerationConsole
        initialCases={sampleCases}
        onInspectCase={handleInspect}
        onResolveCase={handleResolve}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Inspect & Action/i }));
    fireEvent.change(screen.getByLabelText(/Audit Justification Reason/i), { target: { value: "Valid justification reason" } });
    fireEvent.click(screen.getByRole("button", { name: /Authorize & View Reports/i }));

    await waitFor(() => {
      expect(screen.getByText(/Take Moderation Action/i)).toBeDefined();
    });

    const noteInput = screen.getByLabelText(/Resolution Audit Note/i);
    fireEvent.change(noteInput, { target: { value: "Issued 7-day suspension for harassment violation." } });

    const confirmBtn = screen.getByRole("button", { name: /Confirm RESOLVED/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(handleResolve).toHaveBeenCalledWith(
        "case-001-uuid-1111",
        "RESOLVED",
        "Issued 7-day suspension for harassment violation."
      );
    });
  });

  it("fetches audit trail with mandatory reason", async () => {
    const handleAudit = vi.fn().mockResolvedValue([
      {
        id: "log-1",
        actorId: "mod-uuid-1234",
        action: "moderation.case_read",
        reason: "Inspecting report details",
        createdAt: "2026-10-24T15:00:00.000Z",
      },
    ] satisfies AuditLogEntry[]);

    render(
      <ModerationConsole
        initialCases={sampleCases}
        onFetchAudit={handleAudit}
      />
    );

    // Switch to audit tab
    fireEvent.click(screen.getByRole("button", { name: /Admin Audit Trail/i }));

    const input = screen.getByLabelText(/Audit Access Reason/i);
    const fetchBtn = screen.getByRole("button", { name: /Fetch Audit Trail/i });

    fireEvent.change(input, { target: { value: "Routine weekly audit check" } });
    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(handleAudit).toHaveBeenCalledWith("Routine weekly audit check");
      expect(screen.getByText(/moderation.case_read/i)).toBeDefined();
    });
  });
});

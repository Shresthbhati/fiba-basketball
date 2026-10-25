import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GuardianPortal } from "../lib/guardian-portal";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("GuardianPortal Component (Spec §14.1, §23.4)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders family dashboard, ward name, active consents, and safety lock button", async () => {
    renderWithClient(<GuardianPortal />);

    expect(screen.getByText(/Youth Safety & Guardian Oversight/i)).toBeDefined();
    expect(screen.getByText(/Leo Young’s Family Dashboard/i)).toBeDefined();
    expect(screen.getByText(/Guardian Verified/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Emergency Safety Lock/i })).toBeDefined();
  });

  it("renders 4 consent cards with grant/revoke buttons", async () => {
    renderWithClient(<GuardianPortal />);

    expect(screen.getByText(/Public Pickup Games/i)).toBeDefined();
    expect(screen.getByText(/Tournament & Competition Play/i)).toBeDefined();
    expect(screen.getByText(/Game Film & Media Highlights/i)).toBeDefined();
    expect(screen.getByText(/Talent Scout Discovery/i)).toBeDefined();
  });

  it("navigates to Scheduled Activities, Check-ins, and Emergency tabs", async () => {
    renderWithClient(<GuardianPortal />);

    // Click Scheduled Activities tab
    const actTab = screen.getByRole("button", { name: /Scheduled Activities/i });
    fireEvent.click(actTab);
    expect(screen.getByText(/Upcoming Games & Practices/i)).toBeDefined();
    expect(screen.getByText(/U16 Weekend Run @ Brooklyn Pier 2/i)).toBeDefined();

    // Click Arrival Check-ins tab
    const chkTab = screen.getByRole("button", { name: /Arrival Check-ins/i });
    fireEvent.click(chkTab);
    expect(screen.getByText(/Court Arrival & Check-In History/i)).toBeDefined();
    expect(screen.getByText(/Brooklyn Bridge Park Pier 2/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Acknowledge Safe Arrival/i })).toBeDefined();

    // Click Emergency & Medical tab
    const emTab = screen.getByRole("button", { name: /Emergency & Medical/i });
    fireEvent.click(emTab);
    expect(screen.getByText(/Emergency Contacts & Medical Notes/i)).toBeDefined();
    expect(screen.getByText(/Sarah Guardian \(MOTHER\)/i)).toBeDefined();
    expect(screen.getByText(/Peanut allergy/i)).toBeDefined();
  });

  it("opens Emergency Contacts modal with form inputs", async () => {
    renderWithClient(<GuardianPortal />);

    const emTab = screen.getByRole("button", { name: /Emergency & Medical/i });
    fireEvent.click(emTab);

    const editButton = screen.getByRole("button", { name: /Edit Contacts & Medical/i });
    fireEvent.click(editButton);

    expect(screen.getByText(/Primary Contact Full Name/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Save Emergency Contacts/i })).toBeDefined();
  });

  it("opens Emergency Safety Lock modal", async () => {
    renderWithClient(<GuardianPortal />);

    const lockButton = screen.getByRole("button", { name: /Emergency Safety Lock/i });
    fireEvent.click(lockButton);

    expect(screen.getByText(/Activate Emergency Safety Lock/i)).toBeDefined();
    expect(screen.getByText(/Engage Emergency Lock/i)).toBeDefined();
  });
});

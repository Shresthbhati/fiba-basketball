import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FacilityWorkspace } from "../lib/facility-operations";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("FacilityWorkspace Component (Spec §8.3, §23.1)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders facility header, operational KPI cards, and court details", async () => {
    renderWithClient(<FacilityWorkspace />);

    expect(screen.getByText(/Facility Operations & Reservations/i)).toBeDefined();
    expect(screen.getAllByText(/Brooklyn Basketball Complex/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/14-Day Utilization/i)).toBeDefined();
    expect(screen.getByText(/Active Bookings/i)).toBeDefined();
    expect(screen.getByText(/Total Booking Revenue/i)).toBeDefined();
    expect(screen.getByText(/Court Maintenance/i)).toBeDefined();
  });

  it("navigates between Schedule, Maintenance, Operating Hours, and Analytics tabs", async () => {
    renderWithClient(<FacilityWorkspace />);

    // Click Maintenance tab
    const maintTab = screen.getByRole("button", { name: /Maintenance Logs/i });
    fireEvent.click(maintTab);
    expect(screen.getByText(/Court Equipment & Surface Maintenance/i)).toBeDefined();
    expect(screen.getByText(/RIM REPLACEMENT/i)).toBeDefined();

    // Click Operating Hours tab
    const hoursTab = screen.getByRole("button", { name: /Operating Hours & Rates/i });
    fireEvent.click(hoursTab);
    expect(screen.getByText(/Weekly Operating Schedule & Hourly Rates/i)).toBeDefined();
    expect(screen.getByText(/Monday/i)).toBeDefined();

    // Click Analytics tab
    const analyticsTab = screen.getByRole("button", { name: /Utilization Analytics/i });
    fireEvent.click(analyticsTab);
    expect(screen.getByText(/Booking Distribution by Purpose/i)).toBeDefined();
    expect(screen.getByText(/Facility Revenue & Maintenance Summary/i)).toBeDefined();
  });

  it("opens reservation modal and displays estimated cost", async () => {
    renderWithClient(<FacilityWorkspace />);

    const reserveButton = screen.getByRole("button", { name: /\+ Reserve Court Slot/i });
    fireEvent.click(reserveButton);

    expect(screen.getByText(/Reserve Court Floor Slot/i)).toBeDefined();
    expect(screen.getByText(/Estimated Total Fee/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Confirm Reservation/i })).toBeDefined();
  });

  it("opens maintenance modal and displays categories", async () => {
    renderWithClient(<FacilityWorkspace />);

    const maintTab = screen.getByRole("button", { name: /Maintenance Logs/i });
    fireEvent.click(maintTab);

    const logMaintButton = screen.getByRole("button", { name: /\+ Log Maintenance/i });
    fireEvent.click(logMaintButton);

    expect(screen.getByText(/Log Facility Maintenance Event/i)).toBeDefined();
    expect(screen.getByText(/Severity Level/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Save Maintenance Record/i })).toBeDefined();
  });
});

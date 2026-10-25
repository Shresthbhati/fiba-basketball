import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BillingPanel,
  type UserBillingData,
} from "../lib/billing-panel";
import * as apiModule from "../lib/api";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockBillingData: UserBillingData = {
  hasCustomer: true,
  customer: {
    id: "cust-001",
    providerCustomerId: "cus_tokenized_12345",
    currency: "USD",
  },
  subscription: {
    id: "sub-001",
    customerId: "cust-001",
    planId: "PRO_ATHLETE",
    status: "ACTIVE",
    currentPeriodStart: "2026-10-01T00:00:00Z",
    currentPeriodEnd: "2026-11-01T00:00:00Z",
    cancelAtPeriodEnd: false,
    createdAt: "2026-10-01T00:00:00Z",
  },
  recentTransactions: [
    {
      id: "tx-001",
      customerId: "cust-001",
      providerPaymentIntentId: "pi_123456789",
      amountCents: 1499,
      currency: "USD",
      purpose: "SUBSCRIPTION",
      resourceId: null,
      status: "SUCCEEDED",
      receiptUrl: "https://receipts.courtiq.test/pi_123456789",
      createdAt: "2026-10-01T12:00:00Z",
    },
    {
      id: "tx-002",
      customerId: "cust-001",
      providerPaymentIntentId: "pi_court_987",
      amountCents: 4500,
      currency: "USD",
      purpose: "COURT_RESERVATION",
      resourceId: "res-001",
      status: "SUCCEEDED",
      receiptUrl: "https://receipts.courtiq.test/pi_court_987",
      createdAt: "2026-10-15T15:30:00Z",
    },
  ],
  availablePlans: [
    {
      planId: "PRO_ATHLETE",
      name: "Pro Athlete Pass",
      amountCents: 1499,
      currency: "USD",
      interval: "month",
      description: "Advanced kinematic overlays and priority scout placement.",
    },
    {
      planId: "COACH_PLUS",
      name: "Coach Plus Suite",
      amountCents: 3999,
      currency: "USD",
      interval: "month",
      description: "Vector playbook exports and opponent scouting dossiers.",
    },
    {
      planId: "VENUE_ENTERPRISE",
      name: "Venue & Facility Enterprise",
      amountCents: 9999,
      currency: "USD",
      interval: "month",
      description: "Court slot pricing surge and commercial sponsor analytics.",
    },
  ],
};

describe("BillingPanel Component (WP-8.5, Spec §8.5, ADR-0010)", () => {
  beforeEach(() => {
    window.open = vi.fn();
    vi.spyOn(apiModule, "api").mockImplementation((url: string) => {
      if (url.includes("/api/v1/billing/me")) {
        return Promise.resolve(mockBillingData);
      }
      if (url.includes("/api/v1/billing/checkout")) {
        return Promise.resolve({
          sessionId: "cs_mock_123",
          paymentIntentId: "pi_mock_456",
          checkoutUrl: "https://checkout.courtiq.test/pay/cs_mock_123",
          amountCents: 3999,
        });
      }
      if (url.includes("/cancel")) {
        return Promise.resolve({
          ...mockBillingData.subscription,
          cancelAtPeriodEnd: true,
        });
      }
      if (url.includes("/portal")) {
        return Promise.resolve({
          portalUrl: "https://billing.courtiq.test/session/cus_tokenized_12345",
        });
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders billing header, PCI-DSS compliance badge, and active membership card", async () => {
    renderWithClient(<BillingPanel />);

    await waitFor(() => {
      expect(screen.getByText("Membership & Billing")).toBeDefined();
    });

    expect(screen.getByText("PCI-DSS Compliant")).toBeDefined();
    expect(screen.getByText("Zero Card Data Stored on Court IQ Servers")).toBeDefined();

    // Check active membership
    expect(screen.getByTestId("active-subscription-card")).toBeDefined();
    expect(screen.getByText("PRO ATHLETE")).toBeDefined();
    expect(screen.getByText(/Current period ends on/)).toBeDefined();
  });

  it("renders available plan cards and handles upgrade checkout initiation", async () => {
    renderWithClient(<BillingPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("plan-card-COACH_PLUS")).toBeDefined();
    });

    expect(screen.getByText("$39.99")).toBeDefined();
    expect(screen.getByText("$99.99")).toBeDefined();

    // Current plan has disabled button
    expect(screen.getByRole("button", { name: "Current Plan" })).toBeDefined();

    // Click upgrade button for Coach Plus
    fireEvent.click(screen.getByTestId("upgrade-btn-COACH_PLUS"));

    await waitFor(() => {
      expect(screen.getByTestId("checkout-dialog-content")).toBeDefined();
      expect(screen.getByText("Proceed to Tokenized Checkout")).toBeDefined();
      expect(screen.getByText(/https:\/\/checkout\.courtiq\.test\/pay\/cs_mock_123/)).toBeDefined();
    });
  });

  it("renders recent payment transaction history with receipts", async () => {
    renderWithClient(<BillingPanel />);

    await waitFor(() => {
      expect(screen.getByText("Payment History & Invoices")).toBeDefined();
    });

    expect(screen.getByTestId("tx-row-tx-001")).toBeDefined();
    expect(screen.getByTestId("tx-row-tx-002")).toBeDefined();
    expect(screen.getByText("$14.99 USD")).toBeDefined();
    expect(screen.getByText("$45.00 USD")).toBeDefined();
    expect(screen.getAllByText("Receipt ↗").length).toBe(2);
  });

  it("handles cancellation confirmation flow", async () => {
    renderWithClient(<BillingPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("cancel-sub-btn")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("cancel-sub-btn"));

    await waitFor(() => {
      expect(screen.getByText("Confirm Plan Cancellation")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("confirm-cancel-btn"));

    await waitFor(() => {
      expect(apiModule.api).toHaveBeenCalledWith(
        expect.stringContaining("/cancel"),
        expect.anything(),
      );
    });
  });

  it("handles customer portal link dispatch", async () => {
    renderWithClient(<BillingPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("customer-portal-btn")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("customer-portal-btn"));

    await waitFor(() => {
      expect(apiModule.api).toHaveBeenCalledWith(
        "/api/v1/billing/portal",
        expect.anything(),
      );
    });
  });
});

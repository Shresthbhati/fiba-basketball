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
  LoadingState,
} from "@courtiq/design-system";
import { api } from "./api";

export interface BillingPlan {
  planId: "PRO_ATHLETE" | "COACH_PLUS" | "VENUE_ENTERPRISE";
  name: string;
  amountCents: number;
  currency: string;
  interval: string;
  description: string;
}

export interface BillingSubscription {
  id: string;
  customerId: string;
  planId: string;
  status: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "INCOMPLETE";
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

export interface PaymentTransaction {
  id: string;
  customerId: string;
  providerPaymentIntentId: string;
  amountCents: number;
  currency: string;
  purpose: "SUBSCRIPTION" | "COURT_RESERVATION" | "COMPETITION_ENTRY" | "OTHER";
  resourceId: string | null;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
  receiptUrl: string | null;
  createdAt: string;
}

export interface UserBillingData {
  hasCustomer: boolean;
  customer?: {
    id: string;
    providerCustomerId: string;
    currency: string;
  };
  subscription: BillingSubscription | null;
  recentTransactions: PaymentTransaction[];
  availablePlans: BillingPlan[];
}

export function BillingPanel() {
  const qc = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan | null>(null);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<{
    checkoutUrl: string;
    sessionId: string;
  } | null>(null);

  // Fetch billing status
  const { data, isLoading, error, refetch } = useQuery<UserBillingData>({
    queryKey: ["billing", "me"],
    queryFn: () => api<UserBillingData>("/api/v1/billing/me"),
  });

  // Create checkout session mutation
  const checkoutMutation = useMutation({
    mutationFn: (planId: string) =>
      api<{
        sessionId: string;
        paymentIntentId: string;
        checkoutUrl: string;
        amountCents: number;
      }>("/api/v1/billing/checkout", {
        method: "POST",
        body: JSON.stringify({
          purpose: "SUBSCRIPTION",
          planId,
          successUrl: window.location.href,
          cancelUrl: window.location.href,
        }),
      }),
    onSuccess: (res) => {
      setCheckoutResult(res);
    },
  });

  // Cancel subscription mutation
  const cancelMutation = useMutation({
    mutationFn: (subscriptionId: string) =>
      api<BillingSubscription>(`/api/v1/billing/subscriptions/${subscriptionId}/cancel`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing", "me"] });
      setIsCancelConfirmOpen(false);
    },
  });

  // Customer portal session mutation
  const portalMutation = useMutation({
    mutationFn: () =>
      api<{ portalUrl: string }>("/api/v1/billing/portal", {
        method: "POST",
      }),
    onSuccess: (res) => {
      if (typeof window !== "undefined") {
        try {
          window.open(res.portalUrl, "_blank");
        } catch {
          window.location.href = res.portalUrl;
        }
      }
    },
  });

  if (isLoading) {
    return <LoadingState message="Loading your membership and billing records..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Unable to load billing portal"
        message={error.message || "An unexpected error occurred while fetching billing details."}
        onRetry={refetch}
      />
    );
  }

  const currentSub = data?.subscription;
  const transactions = data?.recentTransactions ?? [];
  const plans = data?.availablePlans ?? [];

  return (
    <div className="space-y-8 max-w-6xl mx-auto p-4 sm:p-6" data-testid="billing-panel">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Membership & Billing
            </h1>
            <Badge variant="success" className="text-xs">
              PCI-DSS Compliant
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Tokenized provider billing with zero stored card details (Spec §8.5, ADR-0010).
          </p>
        </div>

        {data?.hasCustomer && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending}
            data-testid="customer-portal-btn"
          >
            {portalMutation.isPending ? "Opening Portal..." : "Payment Methods & Invoices ↗"}
          </Button>
        )}
      </div>

      {/* PCI-DSS Security Guarantee Banner */}
      <Card className="p-4 bg-muted/40 border-primary/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
            🔒
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Zero Card Data Stored on Court IQ Servers
            </h2>
            <p className="text-xs text-muted-foreground">
              All payment credentials and card details are tokenized and processed securely through our hosted payment provider. Court IQ never stores or processes credit card numbers.
            </p>
          </div>
        </div>
        <Badge variant="neutral" className="text-xs whitespace-nowrap">
          PCI-DSS Level 1
        </Badge>
      </Card>

      {/* Current Subscription Status */}
      {currentSub ? (
        <Card className="p-6 bg-card" data-testid="active-subscription-card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Current Membership
                </span>
                <Badge
                  variant={currentSub.cancelAtPeriodEnd ? "warning" : "brand"}
                  className="text-xs"
                >
                  {currentSub.cancelAtPeriodEnd ? "Cancelling at Period End" : currentSub.status}
                </Badge>
              </div>
              <h2 className="text-xl font-bold text-foreground mt-1">
                {currentSub.planId.replace(/_/g, " ")}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Current period ends on{" "}
                <span className="font-semibold text-foreground">
                  {new Date(currentSub.currentPeriodEnd).toLocaleDateString()}
                </span>
                .
              </p>
            </div>

            <div className="flex items-center gap-2">
              {!currentSub.cancelAtPeriodEnd && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsCancelConfirmOpen(true)}
                  data-testid="cancel-sub-btn"
                >
                  Cancel Plan
                </Button>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-5 bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Free Community Athlete</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Access to public pickup games, personal workouts, and verified court directory. Upgrade for advanced analytics and team OS.
            </p>
          </div>
          <Badge variant="neutral" className="text-xs self-start sm:self-auto">
            Current Tier
          </Badge>
        </Card>
      )}

      {/* Available Plans Grid */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-foreground">Available Subscriptions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan) => {
            const isCurrent = currentSub?.planId === plan.planId;
            return (
              <Card
                key={plan.planId}
                className={`p-6 bg-card flex flex-col justify-between transition-all ${
                  isCurrent ? "border-primary ring-1 ring-primary" : "hover:border-border"
                }`}
                data-testid={`plan-card-${plan.planId}`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-foreground">{plan.name}</h3>
                    {isCurrent && (
                      <Badge variant="brand" className="text-[10px]">
                        Active
                      </Badge>
                    )}
                  </div>
                  <div>
                    <span className="text-3xl font-extrabold text-foreground">
                      ${(plan.amountCents / 100).toFixed(2)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">/ {plan.interval}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {plan.description}
                  </p>
                </div>

                <div className="pt-6">
                  {isCurrent ? (
                    <Button variant="secondary" size="sm" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setSelectedPlan(plan);
                        checkoutMutation.mutate(plan.planId);
                      }}
                      disabled={checkoutMutation.isPending}
                      data-testid={`upgrade-btn-${plan.planId}`}
                    >
                      {checkoutMutation.isPending && selectedPlan?.planId === plan.planId
                        ? "Initiating Checkout..."
                        : `Upgrade to ${plan.name}`}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Recent Payment Transactions */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-foreground">Payment History & Invoices</h2>
        {transactions.length > 0 ? (
          <Card className="p-0 overflow-hidden bg-card">
            <div className="divide-y divide-border">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  data-testid={`tx-row-${tx.id}`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {tx.purpose.replace(/_/g, " ")}
                      </span>
                      <Badge
                        variant={tx.status === "SUCCEEDED" ? "success" : tx.status === "PENDING" ? "warning" : "danger"}
                        className="text-[10px]"
                      >
                        {tx.status}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                      Intent: {tx.providerPaymentIntentId} • {new Date(tx.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-foreground">
                      ${(tx.amountCents / 100).toFixed(2)} {tx.currency}
                    </span>
                    {tx.receiptUrl && (
                      <a
                        href={tx.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline text-xs"
                      >
                        Receipt ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <EmptyState
            title="No Payment Transactions"
            description="You have no recorded payments or billing invoices on file."
          />
        )}
      </div>

      {/* Hosted Checkout Redirect Modal */}
      <Dialog
        open={Boolean(checkoutResult)}
        onClose={() => setCheckoutResult(null)}
        title="Proceed to Tokenized Checkout"
      >
        <div className="space-y-4" data-testid="checkout-dialog-content">
          <p className="text-xs text-muted-foreground">
            You are being redirected to our PCI-DSS Level 1 payment gateway to complete your subscription securely.
          </p>
          <div className="p-3 rounded-lg bg-muted border border-border text-xs font-mono break-all text-foreground">
            {checkoutResult?.checkoutUrl}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCheckoutResult(null)}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (typeof window !== "undefined" && checkoutResult?.checkoutUrl) {
                  window.location.href = checkoutResult.checkoutUrl;
                }
              }}
              data-testid="confirm-checkout-redirect-btn"
            >
              Open Checkout Gateway
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog
        open={isCancelConfirmOpen}
        onClose={() => setIsCancelConfirmOpen(false)}
        title="Confirm Plan Cancellation"
      >
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Are you sure you want to cancel your subscription? You will retain all premium features until the end of the current billing cycle.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setIsCancelConfirmOpen(false)}>
              Keep My Plan
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (currentSub?.id) {
                  cancelMutation.mutate(currentSub.id);
                }
              }}
              disabled={cancelMutation.isPending}
              data-testid="confirm-cancel-btn"
            >
              {cancelMutation.isPending ? "Cancelling..." : "Confirm Cancellation"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

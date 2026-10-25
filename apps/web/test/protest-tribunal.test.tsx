import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProtestTribunalWorkspace } from "../lib/protest-tribunal";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("ProtestTribunalWorkspace Component (Spec §8.2, §16.5)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders match header, score, and active protest card", async () => {
    renderWithClient(<ProtestTribunalWorkspace />);

    expect(screen.getByText(/Disciplinary Tribunal & Match Protests/i)).toBeDefined();
    expect(screen.getByRole("heading", { name: /Harlem Hawks vs Queens Knights/i })).toBeDefined();
    expect(screen.getByText(/84 – 82/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /\+ File Official Protest/i })).toBeDefined();

    // Verify existing protest
    expect(screen.getAllByText(/Harlem Hawks/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/SCORE DISCREPANCY/i)).toBeDefined();
    expect(screen.getAllByText(/FIBA Art\. 44 \(Correctable Errors\)/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Official Tribunal Ruling: UPHELD/i)).toBeDefined();
  });

  it("filters protests by status tab", async () => {
    renderWithClient(<ProtestTribunalWorkspace />);

    // Click DISMISSED filter tab (there are no dismissed protests in fallback)
    const dismissedTab = screen.getByRole("button", { name: /^DISMISSED$/i });
    fireEvent.click(dismissedTab);

    expect(screen.getByText(/No Protests Filed/i)).toBeDefined();
    expect(screen.getByText(/No formal disputes or scorebook protests/i)).toBeDefined();

    // Click UPHELD filter tab
    const upheldTab = screen.getByRole("button", { name: /^UPHELD$/i });
    fireEvent.click(upheldTab);

    expect(screen.getAllByText(/FIBA Art\. 44 \(Correctable Errors\)/i).length).toBeGreaterThan(0);
  });

  it("opens File Official Protest dialog and updates input fields", async () => {
    renderWithClient(<ProtestTribunalWorkspace />);

    const openBtn = screen.getByRole("button", { name: /\+ File Official Protest/i });
    fireEvent.click(openBtn);

    expect(screen.getByText(/File Formal Match Protest \(FIBA Rule C\)/i)).toBeDefined();
    expect(screen.getByLabelText(/Filing Team/i)).toBeDefined();
    expect(screen.getByLabelText(/Protest Type/i)).toBeDefined();

    const incidentInput = screen.getByPlaceholderText(/Describe specifically what occurred/i);
    fireEvent.change(incidentInput, {
      target: { value: "Table missed a 3-point conversion in Q3." },
    });

    const submitBtn = screen.getByRole("button", { name: /Submit Official Protest/i });
    expect(submitBtn).toBeDefined();
    expect(submitBtn.hasAttribute("disabled")).toBe(false);

    // Cancel modal
    const cancelBtn = screen.getByRole("button", { name: /Cancel/i });
    fireEvent.click(cancelBtn);
  });
});

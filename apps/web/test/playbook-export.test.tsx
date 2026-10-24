import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PlaybookExportModal } from "../lib/playbook-export-modal";
import { PlaybookEditor, DEFAULT_HORNS_PLAY } from "../lib/playbook-editor";

describe("Playbook Export Modal & Vector SVG / PDF Integration (Spec §10.3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders export modal with options for scope and theme", () => {
    const onClose = vi.fn();
    render(
      <PlaybookExportModal
        open={true}
        onClose={onClose}
        play={DEFAULT_HORNS_PLAY}
        activeStepIdx={0}
      />,
    );

    expect(screen.getByText(/Export Tactical Playbook \(Spec §10\.3\)/i)).toBeDefined();
    expect(screen.getByText(/Current Frame \(Step 1\)/i)).toBeDefined();
    expect(screen.getByText(/All Keyframes/i)).toBeDefined();

    // Theme buttons
    expect(screen.getByRole("button", { name: /^light$/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /^dark$/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /^monochrome$/i })).toBeDefined();

    // Action buttons
    expect(screen.getByRole("button", { name: /Copy SVG/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Download Vector SVG/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Print \/ Export PDF Sheet/i })).toBeDefined();
  });

  it("copies SVG vector markup to clipboard", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <PlaybookExportModal
        open={true}
        onClose={vi.fn()}
        play={DEFAULT_HORNS_PLAY}
        activeStepIdx={0}
      />,
    );

    const copyBtn = screen.getByRole("button", { name: /Copy SVG/i });
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalled();
    expect(await screen.findByText(/✓ Copied to Clipboard!/i)).toBeDefined();
  });

  it("opens print window when clicking Print / Export PDF Sheet", () => {
    const openMock = vi.fn().mockReturnValue({
      document: {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
      },
    });
    vi.stubGlobal("open", openMock);

    render(
      <PlaybookExportModal
        open={true}
        onClose={vi.fn()}
        play={DEFAULT_HORNS_PLAY}
        activeStepIdx={0}
      />,
    );

    const printBtn = screen.getByRole("button", { name: /Print \/ Export PDF Sheet/i });
    fireEvent.click(printBtn);

    expect(openMock).toHaveBeenCalledWith("", "_blank");
  });

  it("opens export modal from PlaybookEditor UI action bar", () => {
    render(<PlaybookEditor initialPlay={DEFAULT_HORNS_PLAY} />);

    const exportBtn = screen.getByRole("button", { name: /Export Vector \/ PDF/i });
    expect(exportBtn).toBeDefined();

    fireEvent.click(exportBtn);
    expect(screen.getByText(/Export Tactical Playbook \(Spec §10\.3\)/i)).toBeDefined();
  });
});

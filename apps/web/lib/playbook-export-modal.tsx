"use client";

import React, { useState } from "react";
import {
  exportPlayKeyframeToSvg,
  exportPlayToMultiFrameSvg,
  generateTacticalPlaybookPrintHtml,
  type TacticalPlay,
} from "@courtiq/court-renderer";
import { Dialog, Button } from "@courtiq/design-system";

export interface PlaybookExportModalProps {
  open: boolean;
  onClose: () => void;
  play: TacticalPlay;
  activeStepIdx: number;
}

export function PlaybookExportModal({
  open,
  onClose,
  play,
  activeStepIdx,
}: PlaybookExportModalProps) {
  const [theme, setTheme] = useState<"light" | "dark" | "monochrome">("light");
  const [exportScope, setExportScope] = useState<"current" | "all">("current");
  const [copied, setCopied] = useState(false);

  const curKf = play.keyframes[activeStepIdx] || play.keyframes[0];

  const handleDownloadSvg = () => {
    let svgContent = "";
    let filename = "";

    if (exportScope === "current" && curKf) {
      svgContent = exportPlayKeyframeToSvg(curKf, {
        mode: play.courtMode,
        theme,
        stepTitle: `Step ${curKf.step}: ${play.title}`,
      });
      filename = `${play.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-step-${curKf.step}.svg`;
    } else {
      svgContent = exportPlayToMultiFrameSvg(play, { theme });
      filename = `${play.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-full-playbook.svg`;
    }

    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySvg = async () => {
    let svgContent = "";
    if (exportScope === "current" && curKf) {
      svgContent = exportPlayKeyframeToSvg(curKf, {
        mode: play.courtMode,
        theme,
      });
    } else {
      svgContent = exportPlayToMultiFrameSvg(play, { theme });
    }

    try {
      await navigator.clipboard.writeText(svgContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handlePrintPlaybook = () => {
    const html = generateTacticalPlaybookPrintHtml(play, {
      teamName: "COURT IQ Playbook",
      authorName: "Coach",
      notes: play.description || undefined,
      theme: theme === "monochrome" ? "monochrome" : "light",
    });

    const printWin = window.open("", "_blank");
    if (printWin) {
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Export Tactical Playbook (Spec §10.3)">
      <div className="space-y-4 text-sm text-neutral-200">
        <div>
          <label className="text-xs font-semibold text-neutral-300">Export Scope</label>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                exportScope === "current"
                  ? "bg-orange-500 text-neutral-950"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }`}
              onClick={() => setExportScope("current")}
            >
              Current Frame (Step {curKf?.step || 1})
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                exportScope === "all"
                  ? "bg-orange-500 text-neutral-950"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }`}
              onClick={() => setExportScope("all")}
            >
              All Keyframes ({play.keyframes.length} Steps)
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-neutral-300">Vector Color Theme</label>
          <div className="mt-1 flex gap-2">
            {(["light", "dark", "monochrome"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  theme === t
                    ? "bg-orange-500 text-neutral-950"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                }`}
                onClick={() => setTheme(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-neutral-900 p-3 border border-neutral-800 text-xs text-neutral-400 space-y-1">
          <div>• High-resolution scalable vector graphic (SVG) format with FIBA court dimensions.</div>
          <div>• Vector markers for cuts (arrows), passes (dashed), dribbles (wavy), and screens (T-bars).</div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-800">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleCopySvg}>
              {copied ? "✓ Copied to Clipboard!" : "Copy SVG"}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleDownloadSvg}>
              Download Vector SVG
            </Button>
            <Button variant="primary" size="sm" onClick={handlePrintPlaybook}>
              Print / Export PDF Sheet
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

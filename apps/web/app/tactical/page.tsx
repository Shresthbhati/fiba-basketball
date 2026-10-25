"use client";

import React from "react";
import { TacticalAnalysisWorkspace } from "../../lib/tactical-analysis-workspace";

export default function TacticalAnalysisPage() {
  return (
    <main className="min-h-screen bg-background py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <TacticalAnalysisWorkspace />
      </div>
    </main>
  );
}

"use client";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { api } from "../../../lib/api";
import { ScorePanel, finalizeMatch } from "../../../lib/score-panel";
import { ScoreQueue } from "../../../lib/score-queue";

export default function Score() {
  const { matchId } = useParams<{ matchId: string }>();
  const queue = useMemo(() => new ScoreQueue(matchId, (path, body) => api(path, { method: "POST", body })), [matchId]);
  return (
    <main>
      <h1>Scorekeeper</h1>
      <ScorePanel queue={queue} onFinalize={() => finalizeMatch(matchId)} />
    </main>
  );
}

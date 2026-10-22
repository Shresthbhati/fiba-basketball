"use client";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { ScorePanel, finalizeMatch, loadMatchInfo, type MatchInfo } from "../../../lib/score-panel";
import { ScoreQueue } from "../../../lib/score-queue";

export default function Score() {
  const { matchId } = useParams<{ matchId: string }>();
  const queue = useMemo(() => new ScoreQueue(matchId, (path, body) => api(path, { method: "POST", body })), [matchId]);
  const [info, setInfo] = useState<MatchInfo | null>(null);
  useEffect(() => {
    let live = true;
    void loadMatchInfo(matchId).then((i) => { if (live) setInfo(i); });
    return () => { live = false; };
  }, [matchId]);
  return (
    <main>
      <h1>Scorekeeper</h1>
      <ScorePanel queue={queue} info={info} onFinalize={() => finalizeMatch(matchId)} />
    </main>
  );
}

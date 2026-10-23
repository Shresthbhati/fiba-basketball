"use client";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { ScorePanel, finalizeMatch, loadMatchInfo, loadRosters, type MatchInfo, type MatchRosters } from "../../../lib/score-panel";
import { ScoreQueue } from "../../../lib/score-queue";

export default function Score() {
  const { matchId } = useParams<{ matchId: string }>();
  const queue = useMemo(() => new ScoreQueue(matchId, (path, body) => api(path, { method: "POST", body })), [matchId]);
  const [info, setInfo] = useState<MatchInfo | null>(null);
  const [rosters, setRosters] = useState<MatchRosters | null>(null);
  useEffect(() => {
    let live = true;
    void loadMatchInfo(matchId).then((i) => { if (live) setInfo(i); });
    void loadRosters(matchId).then((r) => { if (live) setRosters(r); });
    return () => { live = false; };
  }, [matchId]);
  return (
    <main>
      <h1>Scorekeeper</h1>
      <ScorePanel queue={queue} info={info} rosters={rosters} onFinalize={() => finalizeMatch(matchId)} />
    </main>
  );
}

"use client";
import { useParams } from "next/navigation";
import { RosterPanel } from "../../../../../lib/roster-panel";

export default function Roster() {
  const { id, teamId } = useParams<{ id: string; teamId: string }>();
  return <main><h1>Roster</h1><RosterPanel competitionId={id} teamId={teamId} /></main>;
}

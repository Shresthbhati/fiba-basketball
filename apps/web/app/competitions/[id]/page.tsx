"use client";
import { useParams } from "next/navigation";
import { CompetitionPanel } from "../../../lib/competition-panel";

export default function CompetitionPage() {
  const { id } = useParams<{ id: string }>();
  return <main><CompetitionPanel id={id} /></main>;
}

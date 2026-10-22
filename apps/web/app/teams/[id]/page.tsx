"use client";
import { useParams } from "next/navigation";
import { TeamDetail } from "../../../lib/team-detail";

export default function Team() {
  const { id } = useParams<{ id: string }>();
  return <main><TeamDetail teamId={id} /></main>;
}

"use client";
import { useParams } from "next/navigation";
import { GamePanel } from "../../../lib/game-panel";

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  return <main><GamePanel id={id} /></main>;
}

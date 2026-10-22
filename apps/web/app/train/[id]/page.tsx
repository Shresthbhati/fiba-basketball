"use client";
import { useParams } from "next/navigation";
import { WorkoutLogger } from "../../../lib/workout-logger";

export default function Workout() {
  const { id } = useParams<{ id: string }>();
  return <main><WorkoutLogger sessionId={id} /></main>;
}

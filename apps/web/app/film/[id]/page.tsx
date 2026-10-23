"use client";
import { useParams } from "next/navigation";
import { FilmRoom } from "../../../lib/film-room";

export default function Film() {
  const { id } = useParams<{ id: string }>();
  return <main><FilmRoom gameId={id} /></main>;
}

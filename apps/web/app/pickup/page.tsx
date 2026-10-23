"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ApiError, api } from "../../lib/api";
import { MySeries } from "../../lib/my-series";
import { phaseLabel, when, type Game } from "../../lib/game-types";

export default function PickupList() {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("5000");
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function search(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setGames((await api<{ items: Game[] }>(`/pickup?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius_m=${radius}`)).items);
    } catch (err) {
      setGames(null);
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }
  const useMyLocation = () =>
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude.toFixed(4)); setLng(p.coords.longitude.toFixed(4)); },
      () => setError("Location permission denied. Enter coordinates instead."),
    );

  return (
    <main>
      <h1>Pickup games</h1>
      <MySeries />
      <form onSubmit={search} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <label>Latitude<input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" required /></label>
        <label>Longitude<input value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" required /></label>
        <label>Radius
          <select value={radius} onChange={(e) => setRadius(e.target.value)}>
            {[[2000, "2 km"], [5000, "5 km"], [10000, "10 km"], [25000, "25 km"], [50000, "50 km"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <button type="button" className="secondary" onClick={useMyLocation}>Use my current location</button>
        <button type="submit" disabled={loading}>{loading ? "Searching…" : "Find games"}</button>
      </form>
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
      {games && games.length === 0 && <p>No upcoming games in this area. <Link href="/courts">Find a court</Link> and host one.</p>}
      {games && games.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
          {games.map((g) => (
            <li key={g.id} style={{ background: "var(--surface)", padding: 12, borderRadius: 8 }}>
              <Link href={`/pickup/${g.id}`}><strong>{g.title}</strong></Link> · {g.courtName}
              <div style={{ color: "var(--muted)" }}>
                {when(g.startsAt)} · {g.confirmedCount}/{g.capacity} players · {phaseLabel[g.phase]}{g.skillBand ? ` · ${g.skillBand.toLowerCase()}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

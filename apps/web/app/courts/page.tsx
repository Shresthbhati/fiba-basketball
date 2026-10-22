"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ApiError, api } from "../../lib/api";

type Court = { id: string; name: string; indoor: boolean; surface: string | null; hoops: number | null; distanceM: number; verificationStatus: string };

const km = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

export default function Courts() {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("5000");
  const [courts, setCourts] = useState<Court[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function search(e?: FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ items: Court[] }>(`/courts/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius_m=${radius}`);
      setCourts(r.items);
    } catch (err) {
      setCourts(null);
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  // Only runs when the person taps the button; we never ask for location on page load.
  function useMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude.toFixed(4)); setLng(p.coords.longitude.toFixed(4)); },
      () => setError("Location permission denied. Enter coordinates instead."),
    );
  }

  return (
    <main>
      <h1>Find a court</h1>
      <form onSubmit={search} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <label>Latitude<input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" required placeholder="40.7128" /></label>
        <label>Longitude<input value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" required placeholder="-74.0060" /></label>
        <label>Radius
          <select value={radius} onChange={(e) => setRadius(e.target.value)}>
            {[[2000, "2 km"], [5000, "5 km"], [10000, "10 km"], [25000, "25 km"], [50000, "50 km"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <button type="button" className="secondary" onClick={useMyLocation}>Use my current location</button>
        <button type="submit" disabled={loading}>{loading ? "Searching…" : "Search"}</button>
      </form>
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
      {courts && courts.length === 0 && <p>No courts found within that radius. Try a larger radius or add a court.</p>}
      {courts && courts.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
          {courts.map((c) => (
            <li key={c.id} style={{ background: "var(--surface)", padding: 12, borderRadius: 8 }}>
              <strong>{c.name}</strong> · {km(c.distanceM)}
              <div style={{ color: "var(--muted)" }}>
                {c.indoor ? "Indoor" : "Outdoor"}{c.surface ? ` · ${c.surface}` : ""}{c.hoops ? ` · ${c.hoops} hoops` : ""} · {c.verificationStatus === "UNVERIFIED" ? "Unverified" : "Verified"}
              </div>
              <Link href={`/pickup/new?courtId=${c.id}&court=${encodeURIComponent(c.name)}`}>Host a game here</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

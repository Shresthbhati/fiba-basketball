"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ApiError, api } from "../../lib/api";
import { CourtMap, type PublicCourt } from "../../lib/court-map";

type Court = PublicCourt;

const km = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

export default function Courts() {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("5000");
  const [courts, setCourts] = useState<Court[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function search(e?: FormEvent, at?: { lat: string; lng: string }, radiusOverride?: string) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    const targetLat = at?.lat ?? lat;
    const targetLng = at?.lng ?? lng;
    const targetRadius = radiusOverride ?? radius;
    try {
      const r = await api<{ items: Court[] }>(
        `/courts/nearby?lat=${encodeURIComponent(targetLat)}&lng=${encodeURIComponent(targetLng)}&radius_m=${targetRadius}`
      );
      setCourts(r.items);
    } catch (err) {
      setCourts(null);
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  function handleCenterChange(newLat: number, newLng: number) {
    const latStr = newLat.toFixed(4);
    const lngStr = newLng.toFixed(4);
    setLat(latStr);
    setLng(lngStr);
    void search(undefined, { lat: latStr, lng: lngStr });
  }

  function handleRadiusChange(newRadiusM: number) {
    const radStr = String(newRadiusM);
    setRadius(radStr);
    if (lat && lng) {
      void search(undefined, undefined, radStr);
    }
  }

  async function addCourt(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setError(null);
    try {
      await api("/courts", {
        method: "POST",
        body: {
          name: f.get("name"),
          lat: Number(f.get("lat")),
          lng: Number(f.get("lng")),
          indoor: f.get("indoor") === "on",
          ...(f.get("surface") ? { surface: f.get("surface") } : {}),
          ...(f.get("hoops") ? { hoops: Number(f.get("hoops")) } : {}),
        },
      });
      const at = { lat: String(f.get("lat")), lng: String(f.get("lng")) };
      setLat(at.lat);
      setLng(at.lng);
      form.reset();
      await search(undefined, at);
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 401 ? "Log in to add a court." : err.message) : "Could not reach the server.");
    }
  }

  // Only runs when the person taps the button; we never ask for location on page load.
  function useMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const myLat = p.coords.latitude.toFixed(4);
        const myLng = p.coords.longitude.toFixed(4);
        setLat(myLat);
        setLng(myLng);
        void search(undefined, { lat: myLat, lng: myLng });
      },
      () => setError("Location permission denied. Enter coordinates instead."),
    );
  }

  const centerLatNum = Number(lat) || 40.7128;
  const centerLngNum = Number(lng) || -74.006;
  const radiusNum = Number(radius) || 5000;

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

      <div style={{ margin: "24px 0" }}>
        <CourtMap
          courts={courts ?? []}
          centerLat={centerLatNum}
          centerLng={centerLngNum}
          radiusM={radiusNum}
          onCenterChange={handleCenterChange}
          onRadiusChange={handleRadiusChange}
        />
      </div>

      <details style={{ margin: "16px 0" }}>
        <summary>Add a court that isn't listed</summary>
        <form onSubmit={addCourt} aria-label="Add a court" style={{ display: "grid", gap: 12, maxWidth: 420, marginTop: 12 }}>
          <label>Court name<input name="name" required maxLength={120} /></label>
          <label>Latitude<input name="lat" inputMode="decimal" required /></label>
          <label>Longitude<input name="lng" inputMode="decimal" required /></label>
          <label>Surface (optional)<input name="surface" maxLength={60} placeholder="asphalt, wood…" /></label>
          <label>Number of hoops (optional)<input name="hoops" type="number" min={1} max={40} /></label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input name="indoor" type="checkbox" /> Indoor</label>
          <small>New courts show as unverified until a moderator or the community confirms them.</small>
          <button type="submit">Add court</button>
        </form>
      </details>

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

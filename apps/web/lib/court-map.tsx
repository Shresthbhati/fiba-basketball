"use client";
import Link from "next/link";
import React, { useMemo, useState } from "react";
import { Badge, Button, Card, VerificationBadge, type VerificationStatus } from "@courtiq/design-system";
import { CourtActivityPanel } from "./court-activity-panel";
import { CourtPhotoGallery } from "./court-photo-gallery";

export interface PublicCourt {
  id: string;
  name: string;
  lat: number;
  lng: number;
  indoor: boolean;
  surface: string | null;
  hoops: number | null;
  lit: boolean | null;
  accessNotes: string | null;
  verificationStatus: string;
  distanceM: number;
}

export interface CourtMapProps {
  courts: PublicCourt[];
  centerLat: number;
  centerLng: number;
  radiusM: number;
  onSelectCourt?: (court: PublicCourt) => void;
  onCenterChange?: (lat: number, lng: number) => void;
  onRadiusChange?: (radiusM: number) => void;
  selectedCourtId?: string | null;
}

const METERS_PER_DEGREE_LAT = 111320;

export const COURT_PRESETS = [
  { name: "Rucker Park (NYC)", lat: 40.8296, lng: -73.9361 },
  { name: "West 4th 'The Cage' (NYC)", lat: 40.7314, lng: -74.0013 },
  { name: "Venice Beach Courts (LA)", lat: 33.985, lng: -118.4714 },
  { name: "Hoopdome (Toronto)", lat: 43.7441, lng: -79.4883 },
];

export function CourtMap({
  courts,
  centerLat,
  centerLng,
  radiusM,
  onSelectCourt,
  onCenterChange,
  onRadiusChange,
  selectedCourtId: controlledSelectedId,
}: CourtMapProps) {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [filterIndoor, setFilterIndoor] = useState<"ALL" | "INDOOR" | "OUTDOOR">("ALL");
  const [filterVerifiedOnly, setFilterVerifiedOnly] = useState(false);
  const [filterLitOnly, setFilterLitOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");

  const activeSelectedId = controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId;
  const selectedCourt = courts.find((c) => c.id === activeSelectedId);

  // SVG canvas dimensions
  const width = 600;
  const height = 450;
  const cx = width / 2;
  const cy = height / 2;
  const maxMapRadiusPx = Math.min(width, height) * 0.42;

  // Filtered courts
  const filteredCourts = useMemo(() => {
    return courts.filter((c) => {
      if (filterIndoor === "INDOOR" && !c.indoor) return false;
      if (filterIndoor === "OUTDOOR" && c.indoor) return false;
      if (filterVerifiedOnly && c.verificationStatus === "UNVERIFIED") return false;
      if (filterLitOnly && !c.lit) return false;
      return true;
    });
  }, [courts, filterIndoor, filterVerifiedOnly, filterLitOnly]);

  // Project lat/lng to SVG pixel coordinates
  const projectedCourts = useMemo(() => {
    const latRad = (centerLat * Math.PI) / 180;
    const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(latRad);
    const scale = maxMapRadiusPx / Math.max(radiusM, 500);

    return filteredCourts.map((c) => {
      const dLat = c.lat - centerLat;
      const dLng = c.lng - centerLng;
      const xMeters = dLng * metersPerDegreeLng;
      const yMeters = dLat * METERS_PER_DEGREE_LAT;

      const px = cx + xMeters * scale;
      const py = cy - yMeters * scale;
      const isInside = Math.hypot(px - cx, py - cy) <= maxMapRadiusPx * 1.05;

      return {
        ...c,
        px,
        py,
        isInside,
      };
    });
  }, [filteredCourts, centerLat, centerLng, radiusM, cx, cy, maxMapRadiusPx]);

  function handleMapClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!onCenterChange) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert pixel offset back to meters, then to degrees
    const scale = maxMapRadiusPx / Math.max(radiusM, 500);
    const xMeters = (clickX - cx) / scale;
    const yMeters = (cy - clickY) / scale;

    const latRad = (centerLat * Math.PI) / 180;
    const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(latRad);

    const newLat = centerLat + yMeters / METERS_PER_DEGREE_LAT;
    const newLng = centerLng + xMeters / metersPerDegreeLng;

    onCenterChange(Number(newLat.toFixed(4)), Number(newLng.toFixed(4)));
  }

  function handleSelect(c: PublicCourt) {
    setInternalSelectedId(c.id);
    const pureCourt: PublicCourt = {
      id: c.id,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      indoor: c.indoor,
      surface: c.surface,
      hoops: c.hoops,
      lit: c.lit,
      accessNotes: c.accessNotes,
      verificationStatus: c.verificationStatus,
      distanceM: c.distanceM,
    };
    onSelectCourt?.(pureCourt);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* 1. Header Toolbar: Presets & View Mode Toggle */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Jump to basketball hub:</span>
          {COURT_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              className="secondary"
              style={{ fontSize: "0.75rem", padding: "4px 8px", minHeight: "auto" }}
              onClick={() => onCenterChange?.(p.lat, p.lng)}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className={viewMode === "map" ? "" : "secondary"}
            style={{ fontSize: "0.8rem", padding: "6px 12px", minHeight: "auto" }}
            onClick={() => setViewMode("map")}
            aria-pressed={viewMode === "map"}
          >
            🗺️ Map View
          </button>
          <button
            type="button"
            className={viewMode === "list" ? "" : "secondary"}
            style={{ fontSize: "0.8rem", padding: "6px 12px", minHeight: "auto" }}
            onClick={() => setViewMode("list")}
            aria-pressed={viewMode === "list"}
          >
            📋 List View ({filteredCourts.length})
          </button>
        </div>
      </div>

      {/* 2. Filter Bar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          background: "var(--surface)",
          borderRadius: 8,
          fontSize: "0.85rem",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
          <span>Type:</span>
          <select
            value={filterIndoor}
            onChange={(e) => setFilterIndoor(e.target.value as "ALL" | "INDOOR" | "OUTDOOR")}
            style={{ padding: "4px 8px", fontSize: "0.85rem" }}
          >
            <option value="ALL">All courts</option>
            <option value="INDOOR">Indoor only</option>
            <option value="OUTDOOR">Outdoor only</option>
          </select>
        </label>

        {onRadiusChange && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
            <span>Radius:</span>
            <select
              value={radiusM}
              onChange={(e) => onRadiusChange(Number(e.target.value))}
              style={{ padding: "4px 8px", fontSize: "0.85rem" }}
            >
              <option value={2000}>2 km</option>
              <option value={5000}>5 km</option>
              <option value={10000}>10 km</option>
              <option value={25000}>25 km</option>
              <option value={50000}>50 km</option>
            </select>
          </label>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", margin: 0 }}>
          <input
            type="checkbox"
            checked={filterVerifiedOnly}
            onChange={(e) => setFilterVerifiedOnly(e.target.checked)}
          />
          <span>Verified only</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", margin: 0 }}>
          <input
            type="checkbox"
            checked={filterLitOnly}
            onChange={(e) => setFilterLitOnly(e.target.checked)}
          />
          <span>Night lighting</span>
        </label>
      </div>

      {/* 3. Main View: Map or List */}
      {viewMode === "map" ? (
        <div
          style={{
            position: "relative",
            width: "100%",
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            background: "#0c0e12",
          }}
        >
          {/* Instructions banner */}
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 12,
              zIndex: 2,
              background: "rgba(20, 20, 24, 0.85)",
              backdropFilter: "blur(4px)",
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: "0.75rem",
              color: "var(--muted)",
              pointerEvents: "none",
            }}
          >
            Click map to set search center · Click pins for court details
          </div>

          <svg
            viewBox={`0 0 ${width} ${height}`}
            style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }}
            onClick={handleMapClick}
            role="region"
            aria-label="Interactive basketball court map"
          >
            <defs>
              <radialGradient id="courtRadarGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#f97316" stopOpacity="0.12" />
                <stop offset="60%" stopColor="#f97316" stopOpacity="0.04" />
                <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
              </radialGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Grid Lines */}
            <line x1={cx} y1={0} x2={cx} y2={height} stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
            <line x1={0} y1={cy} x2={width} y2={cy} stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />

            {/* Radar Radius Circles */}
            <circle cx={cx} cy={cy} r={maxMapRadiusPx} fill="url(#courtRadarGrad)" stroke="rgba(249, 115, 22, 0.35)" strokeWidth="1.5" />
            <circle cx={cx} cy={cy} r={maxMapRadiusPx * 0.5} fill="none" stroke="rgba(255, 255, 255, 0.08)" strokeDasharray="3 3" />
            <circle cx={cx} cy={cy} r={maxMapRadiusPx * 0.25} fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="3 3" />

            {/* Distance Scale Labels */}
            <text x={cx + maxMapRadiusPx - 4} y={cy - 6} fill="rgba(249, 115, 22, 0.7)" fontSize="10" textAnchor="end">
              {radiusM >= 1000 ? `${radiusM / 1000} km` : `${radiusM} m`}
            </text>
            <text x={cx + maxMapRadiusPx * 0.5 - 4} y={cy - 6} fill="rgba(255, 255, 255, 0.3)" fontSize="9" textAnchor="end">
              {radiusM >= 2000 ? `${radiusM / 2000} km` : `${radiusM / 2} m`}
            </text>

            {/* Center User/Search Pin */}
            <g transform={`translate(${cx}, ${cy})`}>
              <circle r="12" fill="rgba(249, 115, 22, 0.2)" />
              <circle r="5" fill="#f97316" />
              <circle r="2" fill="#ffffff" />
            </g>

            {/* Court Markers */}
            {projectedCourts.map((c) => {
              const isSelected = c.id === activeSelectedId;
              const pinColor = c.indoor ? "#3b82f6" : "#f97316";

              return (
                <g
                  key={c.id}
                  transform={`translate(${c.px}, ${c.py})`}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(c);
                  }}
                  role="button"
                  aria-label={`Court ${c.name}, ${c.indoor ? "indoor" : "outdoor"}, ${c.distanceM}m away`}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelect(c);
                    }
                  }}
                >
                  {/* Selection Ring */}
                  {isSelected && (
                    <circle
                      r="18"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="2"
                      strokeDasharray="3 3"
                      filter="url(#glow)"
                    />
                  )}

                  {/* Marker Body */}
                  <circle
                    r={isSelected ? 12 : 9}
                    fill={pinColor}
                    stroke="#ffffff"
                    strokeWidth={isSelected ? 2 : 1.5}
                  />

                  {/* Icon / Hoops Indicator */}
                  <text
                    x="0"
                    y="3"
                    textAnchor="middle"
                    fill="#000000"
                    fontSize={isSelected ? "9" : "8"}
                    fontWeight="bold"
                  >
                    {c.hoops ? `${c.hoops}H` : "🏀"}
                  </text>

                  {/* Label on Hover / Selected */}
                  {isSelected && (
                    <g transform="translate(0, -18)">
                      <rect
                        x={-c.name.length * 3.5 - 6}
                        y="-14"
                        width={c.name.length * 7 + 12}
                        height="18"
                        rx="4"
                        fill="rgba(10, 10, 12, 0.9)"
                        stroke="rgba(255, 255, 255, 0.2)"
                      />
                      <text
                        x="0"
                        y="-1"
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="10"
                        fontWeight="600"
                      >
                        {c.name}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        /* 4. List View Fallback */
        <div style={{ display: "grid", gap: 10 }}>
          {filteredCourts.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>No courts match current filters.</p>
          ) : (
            filteredCourts.map((c) => (
              <div
                key={c.id}
                style={{
                  background: c.id === activeSelectedId ? "rgba(249, 115, 22, 0.1)" : "var(--surface)",
                  border: c.id === activeSelectedId ? "1px solid #f97316" : "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 8,
                  padding: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                }}
                onClick={() => handleSelect(c)}
              >
                <div>
                  <strong>{c.name}</strong> · {c.distanceM < 1000 ? `${c.distanceM} m` : `${(c.distanceM / 1000).toFixed(1)} km`}
                  <div style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 2 }}>
                    {c.indoor ? "Indoor" : "Outdoor"} · {c.surface ?? "Standard surface"} · {c.hoops ? `${c.hoops} hoops` : "hoops not specified"}
                    {c.lit ? " · 💡 Lit" : ""}
                  </div>
                </div>
                <Button size="sm" variant={c.id === activeSelectedId ? "primary" : "secondary"}>
                  {c.id === activeSelectedId ? "Selected" : "Select"}
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      {/* 5. Selected Court Detail Card / Drawer */}
      {selectedCourt && (
        <Card
          title={selectedCourt.name}
          badge={
            <div style={{ display: "flex", gap: 6 }}>
              <VerificationBadge status={selectedCourt.verificationStatus as VerificationStatus} />
              <Badge variant={selectedCourt.indoor ? "info" : "brand"}>
                {selectedCourt.indoor ? "Indoor" : "Outdoor"}
              </Badge>
            </div>
          }
          actions={
            <button
              type="button"
              className="secondary"
              style={{ fontSize: "0.8rem", padding: "4px 8px" }}
              onClick={() => setInternalSelectedId(null)}
              aria-label="Close court details"
            >
              ✕
            </button>
          }
        >
          <div style={{ display: "grid", gap: 8, fontSize: "0.9rem" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, color: "var(--muted)" }}>
              <span>
                📍 <strong>Distance:</strong> {selectedCourt.distanceM < 1000 ? `${selectedCourt.distanceM} m` : `${(selectedCourt.distanceM / 1000).toFixed(1)} km`}
              </span>
              <span>
                🏀 <strong>Hoops:</strong> {selectedCourt.hoops ?? "Standard"}
              </span>
              <span>
                🛡️ <strong>Surface:</strong> {selectedCourt.surface ?? "Asphalt / Poly"}
              </span>
              <span>
                💡 <strong>Lighting:</strong> {selectedCourt.lit ? "Night floodlights" : "Daylight only"}
              </span>
            </div>

            {selectedCourt.accessNotes && (
              <div style={{ background: "rgba(255, 255, 255, 0.04)", padding: 8, borderRadius: 6, fontSize: "0.85rem" }}>
                <strong>Access info:</strong> {selectedCourt.accessNotes}
              </div>
            )}

            <CourtActivityPanel courtId={selectedCourt.id} courtName={selectedCourt.name} />

            <CourtPhotoGallery
              courtId={selectedCourt.id}
              courtName={selectedCourt.name}
              initialStatus={selectedCourt.verificationStatus}
            />

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
              <Link
                href={`/pickup/new?courtId=${selectedCourt.id}&court=${encodeURIComponent(selectedCourt.name)}`}
                style={{
                  background: "#f97316",
                  color: "#000",
                  fontWeight: 600,
                  padding: "8px 14px",
                  borderRadius: 6,
                  textDecoration: "none",
                  fontSize: "0.85rem",
                  display: "inline-block",
                }}
              >
                Host a game here
              </Link>
              <Link
                href={`/pickup?lat=${selectedCourt.lat}&lng=${selectedCourt.lng}&radius_m=5000`}
                style={{
                  background: "var(--surface)",
                  color: "var(--text)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  padding: "8px 14px",
                  borderRadius: 6,
                  textDecoration: "none",
                  fontSize: "0.85rem",
                  display: "inline-block",
                }}
              >
                Find runs near this court
              </Link>
              {onCenterChange && (
                <button
                  type="button"
                  className="secondary"
                  style={{ fontSize: "0.85rem", padding: "8px 14px" }}
                  onClick={() => onCenterChange(selectedCourt.lat, selectedCourt.lng)}
                >
                  Center map here
                </button>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

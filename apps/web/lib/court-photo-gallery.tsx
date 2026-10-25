"use client";

import React, { useState, useEffect, useCallback, type FormEvent } from "react";
import { api, ApiError } from "./api";

export interface CourtPhoto {
  id: string;
  courtId: string;
  userId: string;
  userDisplayName: string;
  url: string;
  caption: string | null;
  isPrimary: boolean;
  status: string;
  createdAt: string;
}

export interface VerificationConsensus {
  surfaces: Record<string, number>;
  hoops: Record<string, number>;
  lit: { yes: number; no: number };
  indoor: { yes: number; no: number };
}

export interface CourtVerificationsResponse {
  courtId: string;
  totalConfirmations: number;
  verificationStatus: string;
  consensus: VerificationConsensus;
  recentConfirmations: Array<{
    userId: string;
    userDisplayName: string;
    confirmedSurface: string | null;
    confirmedHoops: number | null;
    confirmedLit: boolean | null;
    confirmedIndoor: boolean | null;
    notes: string | null;
    createdAt: string;
  }>;
}

export function CourtPhotoGallery({
  courtId,
  courtName,
  initialStatus = "UNVERIFIED",
}: {
  courtId: string;
  courtName: string;
  initialStatus?: string;
}) {
  const [photos, setPhotos] = useState<CourtPhoto[]>([]);
  const [verifications, setVerifications] = useState<CourtVerificationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Upload modal state
  const [showUpload, setShowUpload] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Confirm attributes modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedSurface, setSelectedSurface] = useState("ASPHALT");
  const [selectedHoops, setSelectedHoops] = useState(2);
  const [selectedLit, setSelectedLit] = useState(true);
  const [selectedIndoor, setSelectedIndoor] = useState(false);
  const [confirmNotes, setConfirmNotes] = useState("");
  const [confirming, setConfirming] = useState(false);

  const [activePhoto, setActivePhoto] = useState<CourtPhoto | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [photoRes, verifRes] = await Promise.all([
        api<{ items: CourtPhoto[] }>(`/courts/${courtId}/photos`).catch(() => ({ items: [] })),
        api<CourtVerificationsResponse>(`/courts/${courtId}/verifications`).catch(() => null),
      ]);
      setPhotos(photoRes.items);
      setVerifications(verifRes);
      if (photoRes.items.length > 0) {
        const primary = photoRes.items.find((p) => p.isPrimary) || photoRes.items[0];
        setActivePhoto(primary ?? null);
      } else {
        setActivePhoto(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load court photos & verifications");
    } finally {
      setLoading(false);
    }
  }, [courtId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleUploadPhoto(e: FormEvent) {
    e.preventDefault();
    if (!photoUrl.trim()) return;
    setUploading(true);
    setError(null);
    try {
      await api(`/courts/${courtId}/photos`, {
        method: "POST",
        body: { url: photoUrl.trim(), caption: caption.trim() || undefined, isPrimary },
      });
      setSuccess("Photo submitted successfully!");
      setShowUpload(false);
      setPhotoUrl("");
      setCaption("");
      setIsPrimary(false);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to upload photo");
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirmAttributes(e: FormEvent) {
    e.preventDefault();
    setConfirming(true);
    setError(null);
    try {
      await api(`/courts/${courtId}/confirm-attributes`, {
        method: "POST",
        body: {
          confirmedSurface: selectedSurface,
          confirmedHoops: Number(selectedHoops),
          confirmedLit: selectedLit,
          confirmedIndoor: selectedIndoor,
          notes: confirmNotes.trim() || undefined,
        },
      });
      setSuccess("Your court verification has been recorded!");
      setShowConfirmModal(false);
      setConfirmNotes("");
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit court verification");
    } finally {
      setConfirming(false);
    }
  }

  const currentStatus = verifications?.verificationStatus ?? initialStatus;
  const confirmationsCount = verifications?.totalConfirmations ?? 0;

  return (
    <div
      style={{
        background: "rgba(15, 23, 42, 0.6)",
        border: "1px solid #1e293b",
        borderRadius: "8px",
        padding: "1rem",
        display: "grid",
        gap: "0.875rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4 style={{ margin: 0, fontSize: "0.95rem", color: "#f8fafc", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span>📸 Court Photos &amp; Verification</span>
          {photos.length > 0 && (
            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
              ({photos.length} photo{photos.length === 1 ? "" : "s"})
            </span>
          )}
        </h4>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() => setShowUpload(!showUpload)}
            style={{
              background: "#334155",
              color: "#f8fafc",
              border: "none",
              borderRadius: "4px",
              padding: "0.25rem 0.6rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Add Photo
          </button>
          <button
            type="button"
            onClick={() => setShowConfirmModal(!showConfirmModal)}
            style={{
              background: "#0284c7",
              color: "#ffffff",
              border: "none",
              borderRadius: "4px",
              padding: "0.25rem 0.6rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ✓ Verify Attributes
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ background: "#450a0a", border: "1px solid #dc2626", color: "#fca5a5", padding: "0.4rem 0.6rem", borderRadius: "4px", fontSize: "0.8rem" }}>
          {error}
        </div>
      )}

      {success && (
        <div role="status" style={{ background: "#052e16", border: "1px solid #16a34a", color: "#86efac", padding: "0.4rem 0.6rem", borderRadius: "4px", fontSize: "0.8rem" }}>
          {success}
        </div>
      )}

      {/* Community Verification Progress Bar */}
      <div style={{ background: "#0f172a", padding: "0.625rem", borderRadius: "6px", display: "grid", gap: "0.35rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
          <span style={{ color: "#94a3b8" }}>
            Community Verification ({confirmationsCount}/3 confirmations)
          </span>
          <span
            style={{
              fontWeight: 700,
              color: currentStatus === "UNVERIFIED" ? "#fb923c" : "#4ade80",
            }}
          >
            {currentStatus}
          </span>
        </div>

        <div style={{ background: "#1e293b", height: "6px", borderRadius: "9999px", overflow: "hidden" }}>
          <div
            style={{
              background: currentStatus === "UNVERIFIED" ? "#f97316" : "#22c55e",
              width: `${Math.min(100, (confirmationsCount / 3) * 100)}%`,
              height: "100%",
              transition: "width 0.3s ease",
            }}
          />
        </div>

        {verifications && confirmationsCount > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.25rem", fontSize: "0.7rem", color: "#cbd5e1" }}>
            {Object.entries(verifications.consensus.surfaces).map(([s, count]) => (
              <span key={s} style={{ background: "#1e293b", padding: "0.15rem 0.4rem", borderRadius: "3px" }}>
                Surface: {s} ({count})
              </span>
            ))}
            {Object.entries(verifications.consensus.hoops).map(([h, count]) => (
              <span key={h} style={{ background: "#1e293b", padding: "0.15rem 0.4rem", borderRadius: "3px" }}>
                Hoops: {h} ({count})
              </span>
            ))}
            {verifications.consensus.lit.yes > 0 && (
              <span style={{ background: "#1e293b", padding: "0.15rem 0.4rem", borderRadius: "3px" }}>
                Night Lights: {verifications.consensus.lit.yes} votes
              </span>
            )}
          </div>
        )}
      </div>

      {/* Photo Gallery View */}
      {loading ? (
        <div style={{ fontSize: "0.8rem", color: "#94a3b8", textAlign: "center", padding: "0.75rem" }}>
          Loading court photos…
        </div>
      ) : photos.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "#64748b", textAlign: "center", padding: "0.5rem" }}>
          No photos uploaded for this court yet. Be the first to share court conditions!
        </div>
      ) : (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {activePhoto && (
            <div style={{ position: "relative", borderRadius: "6px", overflow: "hidden", background: "#000", maxHeight: "240px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img
                src={activePhoto.url}
                alt={activePhoto.caption || `${courtName} court photo`}
                style={{ width: "100%", height: "200px", objectFit: "cover" }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
                  padding: "0.5rem",
                  fontSize: "0.75rem",
                  color: "#f8fafc",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                }}
              >
                <div>
                  {activePhoto.caption && <div style={{ fontWeight: 600 }}>{activePhoto.caption}</div>}
                  <div style={{ color: "#94a3b8", fontSize: "0.7rem" }}>
                    By {activePhoto.userDisplayName}
                  </div>
                </div>
                {activePhoto.isPrimary && (
                  <span style={{ background: "#f97316", color: "#fff", fontSize: "0.65rem", padding: "0.15rem 0.4rem", borderRadius: "3px", fontWeight: 700 }}>
                    PRIMARY
                  </span>
                )}
              </div>
            </div>
          )}

          {photos.length > 1 && (
            <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.25rem" }}>
              {photos.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setActivePhoto(p)}
                  style={{
                    border: activePhoto?.id === p.id ? "2px solid #f97316" : "1px solid #334155",
                    borderRadius: "4px",
                    overflow: "hidden",
                    padding: 0,
                    width: "56px",
                    height: "42px",
                    cursor: "pointer",
                    flexShrink: 0,
                    background: "#000",
                  }}
                >
                  <img src={p.url} alt={p.caption || "Thumbnail"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Photo Form */}
      {showUpload && (
        <form onSubmit={handleUploadPhoto} style={{ background: "#0b0f19", padding: "0.75rem", borderRadius: "6px", display: "grid", gap: "0.5rem" }}>
          <div style={{ fontWeight: 600, fontSize: "0.825rem", color: "#f8fafc" }}>Upload Court Photo</div>
          <label style={{ fontSize: "0.75rem", color: "#cbd5e1", display: "grid", gap: "0.2rem" }}>
            Photo Image URL
            <input
              type="url"
              required
              placeholder="https://..."
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "4px", padding: "0.35rem 0.5rem", color: "#fff", fontSize: "0.8rem" }}
            />
          </label>
          <label style={{ fontSize: "0.75rem", color: "#cbd5e1", display: "grid", gap: "0.2rem" }}>
            Caption (optional)
            <input
              type="text"
              placeholder="Rim height, court condition, lighting..."
              maxLength={200}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "4px", padding: "0.35rem 0.5rem", color: "#fff", fontSize: "0.8rem" }}
            />
          </label>
          <label style={{ fontSize: "0.75rem", color: "#cbd5e1", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
            Set as Primary Court Cover Photo
          </label>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
            <button
              type="submit"
              disabled={uploading}
              style={{ background: "#f97316", color: "#fff", border: "none", borderRadius: "4px", padding: "0.35rem 0.75rem", fontSize: "0.8rem", fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer" }}
            >
              {uploading ? "Submitting…" : "Upload"}
            </button>
            <button
              type="button"
              onClick={() => setShowUpload(false)}
              style={{ background: "transparent", color: "#94a3b8", border: "1px solid #334155", borderRadius: "4px", padding: "0.35rem 0.6rem", fontSize: "0.8rem", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Verify Attributes Form */}
      {showConfirmModal && (
        <form onSubmit={handleConfirmAttributes} style={{ background: "#0b0f19", padding: "0.75rem", borderRadius: "6px", display: "grid", gap: "0.5rem" }}>
          <div style={{ fontWeight: 600, fontSize: "0.825rem", color: "#f8fafc" }}>
            Confirm Court Attributes (Community Consensus)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.75rem", color: "#cbd5e1", display: "grid", gap: "0.2rem" }}>
              Playing Surface
              <select
                value={selectedSurface}
                onChange={(e) => setSelectedSurface(e.target.value)}
                style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "4px", padding: "0.35rem", color: "#fff", fontSize: "0.8rem" }}
              >
                <option value="ASPHALT">Asphalt</option>
                <option value="CONCRETE">Concrete</option>
                <option value="WOOD">Hardwood (Indoor)</option>
                <option value="TARTAN">Tartan / Poly</option>
                <option value="OTHER">Other</option>
              </select>
            </label>

            <label style={{ fontSize: "0.75rem", color: "#cbd5e1", display: "grid", gap: "0.2rem" }}>
              Total Hoops
              <input
                type="number"
                min={1}
                max={20}
                value={selectedHoops}
                onChange={(e) => setSelectedHoops(Number(e.target.value))}
                style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "4px", padding: "0.35rem", color: "#fff", fontSize: "0.8rem" }}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: "1rem" }}>
            <label style={{ fontSize: "0.75rem", color: "#cbd5e1", display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <input type="checkbox" checked={selectedLit} onChange={(e) => setSelectedLit(e.target.checked)} />
              Night Lighting Available
            </label>
            <label style={{ fontSize: "0.75rem", color: "#cbd5e1", display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <input type="checkbox" checked={selectedIndoor} onChange={(e) => setSelectedIndoor(e.target.checked)} />
              Indoor Facility
            </label>
          </div>

          <label style={{ fontSize: "0.75rem", color: "#cbd5e1", display: "grid", gap: "0.2rem" }}>
            Verification Notes (optional)
            <input
              type="text"
              placeholder="Condition, rim chain nets, double rims..."
              maxLength={200}
              value={confirmNotes}
              onChange={(e) => setConfirmNotes(e.target.value)}
              style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "4px", padding: "0.35rem 0.5rem", color: "#fff", fontSize: "0.8rem" }}
            />
          </label>

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
            <button
              type="submit"
              disabled={confirming}
              style={{ background: "#0284c7", color: "#fff", border: "none", borderRadius: "4px", padding: "0.35rem 0.75rem", fontSize: "0.8rem", fontWeight: 600, cursor: confirming ? "not-allowed" : "pointer" }}
            >
              {confirming ? "Saving…" : "Submit Verification"}
            </button>
            <button
              type="button"
              onClick={() => setShowConfirmModal(false)}
              style={{ background: "transparent", color: "#94a3b8", border: "1px solid #334155", borderRadius: "4px", padding: "0.35rem 0.6rem", fontSize: "0.8rem", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

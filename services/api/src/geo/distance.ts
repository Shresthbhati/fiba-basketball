const R = 6_371_000; // metres
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Box that fully contains the circle; used as an index-friendly prefilter before exact distance. */
export function boundingBox(c: { lat: number; lng: number }, radiusM: number) {
  const dLat = (radiusM / R) * (180 / Math.PI);
  const dLng = dLat / Math.max(Math.cos(rad(c.lat)), 0.01);
  return { minLat: c.lat - dLat, maxLat: c.lat + dLat, minLng: c.lng - dLng, maxLng: c.lng + dLng };
}

/** Never return exact distances: round to 100 m so a point can't be triangulated. */
export const roundDistance = (m: number) => Math.round(m / 100) * 100;

export const MAX_RADIUS_M = 50_000;
export const MAX_RESULTS = 100;

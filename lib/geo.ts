export const toRadians = (value: number): number => (value * Math.PI) / 180;

export const distanceMeters = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const earthRadius = 6_371_000;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
};

export const isWithinRadius = (
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
  testLat: number,
  testLng: number
): boolean => distanceMeters(centerLat, centerLng, testLat, testLng) <= radiusMeters;

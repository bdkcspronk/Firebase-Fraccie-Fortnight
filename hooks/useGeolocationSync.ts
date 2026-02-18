"use client";

import { useEffect, useRef, useState } from "react";
import { update, ref } from "firebase/database";
import { db } from "@/lib/firebase";
import { LOCATION_MIN_DISTANCE_METERS, LOCATION_WRITE_INTERVAL_MS } from "@/lib/constants";
import { distanceMeters } from "@/lib/geo";

export interface Position {
  lat: number;
  lng: number;
}

export function useGeolocationSync(teamId: string | null, enabled: boolean) {
  const [position, setPosition] = useState<Position | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const lastWrittenRef = useRef<Position | null>(null);
  const lastWriteTsRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled || !teamId || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(current);

        const now = Date.now();
        const last = lastWrittenRef.current;
        const movedEnough =
          !last || distanceMeters(last.lat, last.lng, current.lat, current.lng) >= LOCATION_MIN_DISTANCE_METERS;
        const timeElapsed = now - lastWriteTsRef.current >= LOCATION_WRITE_INTERVAL_MS;

        if (movedEnough && timeElapsed) {
          await update(ref(db, `teams/${teamId}`), {
            lat: current.lat,
            lng: current.lng,
            lastUpdate: now
          });
          lastWrittenRef.current = current;
          lastWriteTsRef.current = now;
        }
      },
      (err) => setGeoError(err.message),
      { enableHighAccuracy: true, maximumAge: 3_000, timeout: 15_000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [teamId, enabled]);

  return { position, geoError };
}

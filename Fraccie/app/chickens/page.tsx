"use client";

import { useEffect, useState } from "react";
import { GameMap } from "@/components/GameMap";
import { useAuthTeam } from "@/hooks/useAuthTeam";
import { useGameState } from "@/hooks/useGameState";
import { useRealtimeCollection } from "@/hooks/useRealtimeCollection";
import { adminSetCircleCenter, adminSetCircleRadius } from "@/lib/admin";
import { Bar, Team } from "@/lib/types";

export default function ChickensPage() {
  const { uid, isAdmin, loading, authError } = useAuthTeam({ bootstrapTeam: false });
  const game = useGameState();
  const teams = useRealtimeCollection<Team>("teams", Boolean(uid));
  const bars = useRealtimeCollection<Bar>("bars", Boolean(uid));

  const [centerLatInput, setCenterLatInput] = useState(String(game.circle_center_lat));
  const [centerLngInput, setCenterLngInput] = useState(String(game.circle_center_lng));
  const [radiusInput, setRadiusInput] = useState(String(game.circle_radius));
  const [centerPending, setCenterPending] = useState(false);
  const [radiusPending, setRadiusPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!centerPending) {
      setCenterLatInput(String(game.circle_center_lat));
      setCenterLngInput(String(game.circle_center_lng));
    }
    if (!radiusPending) {
      setRadiusInput(String(Math.round(game.circle_radius)));
    }
  }, [game.circle_center_lat, game.circle_center_lng, game.circle_radius, centerPending, radiusPending]);

  const saveCenter = async () => {
    const lat = Number(centerLatInput);
    const lng = Number(centerLngInput);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setMessage("Enter valid center coordinates.");
      return;
    }

    setCenterPending(true);
    setMessage(null);
    try {
      await adminSetCircleCenter(lat, lng);
      setMessage("Center updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update center.");
    } finally {
      setCenterPending(false);
    }
  };

  const saveRadius = async () => {
    const radius = Number(radiusInput);
    if (!Number.isFinite(radius) || radius < 20) {
      setMessage("Enter a valid radius of at least 20m.");
      return;
    }

    setRadiusPending(true);
    setMessage(null);
    try {
      await adminSetCircleRadius(radius);
      setMessage("Radius updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update radius.");
    } finally {
      setRadiusPending(false);
    }
  };

  if (loading) return <main className="p-4">Loading...</main>;

  if (authError) {
    return (
      <main className="grid h-screen place-items-center p-6 text-center">
        <div className="w-full max-w-xl rounded bg-slate-900 p-4">
          <h1 className="mb-2 text-xl">Connection error</h1>
          <p className="text-slate-300">{authError}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen space-y-3 bg-slate-950 p-4 text-sm text-slate-100">
      <h1 className="text-xl">Chickens (Spectator)</h1>
      <div>Status: {game.status}</div>
      <div>Radius: {Math.round(game.circle_radius)}m</div>

      <section className="rounded border border-slate-700 p-3">
        <div className="h-[70vh] overflow-hidden rounded border border-slate-800">
          <GameMap
            position={{ lat: game.circle_center_lat, lng: game.circle_center_lng }}
            teams={teams}
            bars={bars}
            game={game}
            enabled
            interactive
            currentTeamId={null}
            showTeamLabels
          />
        </div>
      </section>

      {isAdmin ? (
        <section className="rounded border border-slate-700 p-3">
          <h2 className="mb-2 font-semibold">Admin map controls</h2>
          <div className="mb-2 flex flex-wrap gap-2">
            <input
              value={centerLatInput}
              onChange={(event) => setCenterLatInput(event.target.value)}
              className="rounded bg-slate-900 px-2 py-1"
              placeholder="Latitude"
            />
            <input
              value={centerLngInput}
              onChange={(event) => setCenterLngInput(event.target.value)}
              className="rounded bg-slate-900 px-2 py-1"
              placeholder="Longitude"
            />
            <button className="rounded bg-indigo-700 px-3 py-1" onClick={() => void saveCenter()} disabled={centerPending}>
              {centerPending ? "Saving..." : "Set center"}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              value={radiusInput}
              onChange={(event) => setRadiusInput(event.target.value)}
              className="rounded bg-slate-900 px-2 py-1"
              placeholder="Radius in meters"
            />
            <button className="rounded bg-emerald-700 px-3 py-1" onClick={() => void saveRadius()} disabled={radiusPending}>
              {radiusPending ? "Saving..." : "Set radius"}
            </button>
          </div>

          {message ? <div className="mt-2 text-xs text-slate-300">{message}</div> : null}
        </section>
      ) : null}
    </main>
  );
}

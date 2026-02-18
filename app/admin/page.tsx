"use client";

import { useState } from "react";
import { ref, update } from "firebase/database";
import { useAuthTeam } from "@/hooks/useAuthTeam";
import { useGameState } from "@/hooks/useGameState";
import { useRealtimeCollection } from "@/hooks/useRealtimeCollection";
import { adminEndGame, adminOverrideBattle, adminResetGame, adminShrinkCircle, adminStartGame } from "@/lib/admin";
import { db } from "@/lib/firebase";
import { Battle, Team } from "@/lib/types";

export default function AdminPage() {
  const { isAdmin, uid } = useAuthTeam();
  const game = useGameState();
  const teams = useRealtimeCollection<Team>("teams");
  const battles = useRealtimeCollection<Battle>("battles");
  const [password, setPassword] = useState("");
  const passOk = password === (process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "") || isAdmin;

  if (!uid) return <main className="p-4">Loading...</main>;

  if (!passOk) {
    return (
      <main className="grid h-screen place-items-center p-6">
        <div className="w-full max-w-sm rounded bg-slate-900 p-4">
          <h1 className="mb-2 text-xl">Admin Access</h1>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded bg-slate-800 p-2"
            placeholder="Admin password"
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen space-y-3 bg-slate-950 p-4 text-sm text-slate-100">
      <h1 className="text-xl">Admin panel</h1>
      <div>Status: {game.status}</div>
      <div>Radius: {Math.round(game.circle_radius)}m</div>

      <div className="flex flex-wrap gap-2">
        <button className="rounded bg-green-700 px-3 py-2" onClick={() => adminStartGame()}>Start game</button>
        <button className="rounded bg-indigo-700 px-3 py-2" onClick={() => adminShrinkCircle()}>Shrink circle</button>
        <button className="rounded bg-amber-700 px-3 py-2" onClick={() => adminEndGame()}>End game</button>
        <button className="rounded bg-red-700 px-3 py-2" onClick={() => adminResetGame()}>Reset game</button>
      </div>

      <section className="rounded border border-slate-700 p-3">
        <h2 className="mb-2 font-semibold">Teams</h2>
        <div className="space-y-1">
          {Object.entries(teams).map(([teamId, team]) => (
            <div key={teamId} className="flex items-center justify-between rounded bg-slate-900 p-2">
              <span>{team.name} ({teamId.slice(0, 6)})</span>
              <button
                className="rounded bg-slate-700 px-2"
                onClick={() => update(ref(db, `teams/${teamId}`), { wins: 0, losses: 0 })}
              >
                Reset W/L
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border border-slate-700 p-3">
        <h2 className="mb-2 font-semibold">Battles</h2>
        <div className="space-y-2">
          {Object.entries(battles).map(([battleId, battle]) => (
            <div key={battleId} className="rounded bg-slate-900 p-2">
              <div>{battle.team_a.slice(0, 4)} vs {battle.team_b.slice(0, 4)} - {battle.status}</div>
              <div className="mt-1 flex gap-1">
                <button className="rounded bg-emerald-700 px-2" onClick={() => adminOverrideBattle(battleId, battle.team_a)}>A wins</button>
                <button className="rounded bg-emerald-700 px-2" onClick={() => adminOverrideBattle(battleId, battle.team_b)}>B wins</button>
                <button className="rounded bg-red-700 px-2" onClick={() => adminOverrideBattle(battleId, null)}>Cancel</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

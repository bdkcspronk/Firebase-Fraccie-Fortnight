"use client";

import { useEffect, useMemo, useState } from "react";
import { ref, update } from "firebase/database";
import { GameMap } from "@/components/GameMap";
import { useAuthTeam } from "@/hooks/useAuthTeam";
import { useBattleLogic } from "@/hooks/useBattleLogic";
import { useGameState } from "@/hooks/useGameState";
import { useGeolocationSync } from "@/hooks/useGeolocationSync";
import { useRealtimeCollection } from "@/hooks/useRealtimeCollection";
import { db } from "@/lib/firebase";
import { Bar, Battle, Team } from "@/lib/types";

export default function HomePage() {
  const { teamId, team, loading, isAdmin } = useAuthTeam();
  const game = useGameState();
  const teams = useRealtimeCollection<Team>("teams");
  const bars = useRealtimeCollection<Bar>("bars");
  const battles = useRealtimeCollection<Battle>("battles");
  const { position, geoError } = useGeolocationSync(teamId, game.status === "running");
  const [codeInput, setCodeInput] = useState("");

  const battle = useBattleLogic(teamId, teams, bars, battles);

  useEffect(() => {
    if (!isAdmin) return;
    void battle.autoCancelExpiredBattles();
  }, [battle, isAdmin]);

  const myPendingBattles = useMemo(
    () =>
      Object.entries(battles).filter(
        ([, b]) => (b.team_a === teamId || b.team_b === teamId) && !b.confirmed && b.status !== "cancelled"
      ),
    [battles, teamId]
  );

  const submitCode = async () => {
    if (codeInput.trim() !== game.secret_code) return;
    await update(ref(db, "game"), { winner_team_id: teamId, status: "finished" });
  };

  if (loading || !teamId || !team) return <main className="p-4">Loading...</main>;

  if (game.status === "waiting") {
    return <main className="grid h-screen place-items-center text-xl">Waiting for game start…</main>;
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <GameMap position={position} teams={teams} bars={bars} game={game} enabled={game.status === "running"} />

      <section className="absolute left-2 right-2 top-2 rounded bg-slate-900/80 p-3 text-sm">
        <div>Status: {game.status}</div>
        <div>Circle radius: {Math.round(game.circle_radius)}m</div>
        {geoError ? <div className="text-red-300">GPS: {geoError}</div> : null}
      </section>

      <section className="absolute bottom-2 left-2 right-2 rounded bg-slate-900/80 p-3 text-sm">
        <div className="mb-2">{team.name} • {team.wins}W-{team.losses}L</div>

        <div className="mb-2 flex gap-2">
          {battle.availableTeamIds.slice(0, 3).map((id) => (
            <button key={id} className="rounded bg-indigo-600 px-3 py-2" onClick={() => battle.startBattle(id)}>
              Start battle vs {teams[id]?.name ?? id.slice(0, 4)}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          {myPendingBattles.map(([battleId, b]) => (
            <div key={battleId} className="rounded border border-slate-700 p-2">
              <div>Battle: {b.type || "choose type"}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                <button className="rounded bg-slate-700 px-2" onClick={() => battle.setBattleType(battleId, "chug")}>Chug</button>
                <button className="rounded bg-slate-700 px-2" onClick={() => battle.setBattleType(battleId, "challenge")}>Challenge</button>
                <button className="rounded bg-emerald-700 px-2" onClick={() => battle.submitWinner(battleId, teamId)}>I won</button>
                {b.winner && b.team_a !== teamId ? (
                  <button className="rounded bg-amber-700 px-2" onClick={() => battle.confirmBattle(battleId)}>Confirm</button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={codeInput}
            onChange={(event) => setCodeInput(event.target.value)}
            className="flex-1 rounded bg-slate-800 px-2 py-2"
            placeholder="Enter secret code"
            disabled={game.status === "finished"}
          />
          <button className="rounded bg-green-700 px-3" onClick={submitCode} disabled={game.status === "finished"}>
            Submit
          </button>
        </div>
      </section>

      {game.status === "finished" ? (
        <div className="absolute inset-0 grid place-items-center bg-black/70 text-2xl">Winner: {game.winner_team_id}</div>
      ) : null}
    </main>
  );
}

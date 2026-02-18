"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ref, update } from "firebase/database";
import { GameMap } from "@/components/GameMap";
import { useAuthTeam } from "@/hooks/useAuthTeam";
import { useBattleLogic } from "@/hooks/useBattleLogic";
import { useGameState } from "@/hooks/useGameState";
import { useGeolocationSync } from "@/hooks/useGeolocationSync";
import { useRealtimeCollection } from "@/hooks/useRealtimeCollection";
import { GAME_READY_STORAGE_KEY } from "@/lib/constants";
import { db } from "@/lib/firebase";
import { distanceMeters } from "@/lib/geo";
import { Bar, Battle, Team } from "@/lib/types";
import logoImage from "./images/logo_300_300.png";

export default function HomePage() {
  const { uid, teamId, team, loading, isAdmin, authError, createTeam, joinTeamByCode, teamActionPending, teamActionError, playerName, updatePlayerName, updateTeamName } = useAuthTeam();
  const game = useGameState();
  const teams = useRealtimeCollection<Team>("teams", Boolean(uid));
  const bars = useRealtimeCollection<Bar>("bars", Boolean(uid));
  const battles = useRealtimeCollection<Battle>("battles", Boolean(uid));
  const { position, geoError } = useGeolocationSync(uid, teamId, game.status === "running");
  const [codeInput, setCodeInput] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [copiedTeamCode, setCopiedTeamCode] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [namePending, setNamePending] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [teamNameInput, setTeamNameInput] = useState("");
  const [teamNamePending, setTeamNamePending] = useState(false);
  const [teamNameError, setTeamNameError] = useState<string | null>(null);
  const [barMessage, setBarMessage] = useState<string | null>(null);
  const [joinGamePending, setJoinGamePending] = useState(false);
  const [isReadyForGame, setIsReadyForGame] = useState(false);
  const previousStatusRef = useRef<string | null>(null);

  const battle = useBattleLogic(teamId, teams, bars, battles, isAdmin);

  useEffect(() => {
    void battle.autoCancelExpiredBattles();
  }, [battle.autoCancelExpiredBattles]);

  const myPendingBattles = useMemo(
    () =>
      Object.entries(battles).filter(
        ([, b]) => (b.team_a === teamId || b.team_b === teamId) && !b.confirmed && b.status !== "cancelled"
      ),
    [battles, teamId]
  );

  const teamPlayers = useMemo(() => {
    const now = Date.now();
    return Object.entries(team?.memberProfiles ?? {}).map(([memberUid, profile]) => ({
      uid: memberUid,
      name: profile.name,
      active: now - profile.lastSeen <= 60_000
    }));
  }, [team]);

  const nearbyActiveBars = useMemo(() => {
    if (!position) return [] as Array<{ id: string; bar: Bar; distance: number }>;

    return Object.entries(bars)
      .map(([id, bar]) => ({
        id,
        bar,
        distance: distanceMeters(position.lat, position.lng, bar.lat, bar.lng)
      }))
      .filter(({ bar, distance }) => bar.active !== false && distance <= bar.radius)
      .sort((left, right) => left.distance - right.distance);
  }, [bars, position]);

  useEffect(() => {
    setNameInput(playerName);
  }, [playerName]);

  useEffect(() => {
    setTeamNameInput(team?.name ?? "");
  }, [team?.name]);

  useEffect(() => {
    const storedReady = localStorage.getItem(GAME_READY_STORAGE_KEY) === "true";
    setIsReadyForGame(storedReady);
  }, []);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    if (game.status === "waiting" && previousStatus && previousStatus !== "waiting") {
      setIsReadyForGame(false);
      localStorage.removeItem(GAME_READY_STORAGE_KEY);
    }
    previousStatusRef.current = game.status;
  }, [game.status]);

  const submitCode = async () => {
    if (codeInput.trim() !== game.secret_code) return;
    await update(ref(db, "game"), { winner_team_id: teamId, status: "finished" });
  };

  const copyTeamCode = async () => {
    if (!team?.joinCode) return;

    try {
      await navigator.clipboard.writeText(team.joinCode);
      setCopiedTeamCode(true);
      setTimeout(() => setCopiedTeamCode(false), 1_500);
    } catch {
      setCopiedTeamCode(false);
    }
  };

  const markBarInactive = async (barId: string) => {
    setBarMessage(null);
    try {
      await update(ref(db, `bars/${barId}`), {
        active: false,
        clearedAt: Date.now(),
        clearedBy: uid ?? teamId ?? "unknown"
      });
      setBarMessage("Bar marked inactive.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to mark bar inactive.";
      setBarMessage(message);
    }
  };

  if (loading) return <main className="p-4">Loading...</main>;

  if (authError) {
    return (
      <main className="grid h-screen place-items-center p-6 text-center">
        <div className="w-full max-w-xl rounded bg-slate-900 p-4">
          <h1 className="mb-2 text-xl">Connection error</h1>
          <p className="text-slate-300">{authError}</p>
          <p className="mt-2 text-slate-400">Enable Anonymous Auth in Firebase Authentication and verify Realtime Database URL in environment variables.</p>
        </div>
      </main>
    );
  }

  if (!teamId || !team) {
    return <main className="p-4">Unable to load your team. Please refresh.</main>;
  }

  if (game.status !== "finished" && (game.status === "waiting" || !isReadyForGame)) {
    const saveName = async () => {
      setNamePending(true);
      setNameError(null);
      try {
        await updatePlayerName(nameInput);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save player name.";
        setNameError(message);
      } finally {
        setNamePending(false);
      }
    };

    const saveTeamName = async () => {
      setTeamNamePending(true);
      setTeamNameError(null);
      try {
        await updateTeamName(teamNameInput);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save team name.";
        setTeamNameError(message);
      } finally {
        setTeamNamePending(false);
      }
    };

    const joinGameNow = async () => {
      setJoinGamePending(true);
      try {
        setIsReadyForGame(true);
        localStorage.setItem(GAME_READY_STORAGE_KEY, "true");
      } catch {
        setIsReadyForGame(false);
      } finally {
        setJoinGamePending(false);
      }
    };

    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div className="w-full max-w-xl rounded bg-slate-900 p-5 text-slate-100">
          <div className="mb-4 flex justify-center">
            <img src={logoImage.src} alt="Fraccie logo" className="h-24 w-24" />
          </div>
          <h1 className="mb-2 text-xl">Waiting for game start…</h1>
          <p className="mb-1 text-slate-300">Current team: {team.name}</p>
          <div className="mb-4 flex items-center justify-center gap-2 text-slate-300">
            <p>
              Share code: <span className="font-semibold tracking-wide">{team.joinCode ?? "No code yet"}</span>
            </p>
            <button
              className="rounded bg-slate-700 px-2 py-1 text-xs"
              onClick={() => void copyTeamCode()}
              disabled={!team.joinCode}
            >
              {copiedTeamCode ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="mb-3 flex flex-wrap justify-center gap-2">
            <button className="rounded bg-indigo-600 px-3 py-2" onClick={() => void createTeam()} disabled={teamActionPending}>
              Create new team code
            </button>
          </div>

          <div className="mx-auto flex max-w-sm gap-2">
            <input
              value={joinCodeInput}
              onChange={(event) => setJoinCodeInput(event.target.value.toUpperCase())}
              className="flex-1 rounded bg-slate-800 px-2 py-2"
              placeholder="Enter team code"
              maxLength={6}
              disabled={teamActionPending}
            />
            <button
              className="rounded bg-emerald-700 px-3"
              onClick={() => void joinTeamByCode(joinCodeInput)}
              disabled={teamActionPending}
            >
              Join
            </button>
          </div>

          {teamActionError ? <p className="mt-3 text-sm text-red-300">{teamActionError}</p> : null}

          <div className="mt-4 rounded bg-slate-800/60 p-3 text-left">
            <p className="mb-2 text-sm font-semibold">Team name</p>
            <div className="flex gap-2">
              <input
                value={teamNameInput}
                onChange={(event) => setTeamNameInput(event.target.value)}
                className="flex-1 rounded bg-slate-800 px-2 py-2"
                placeholder="Enter team name"
                maxLength={32}
                disabled={teamNamePending}
              />
              <button className="rounded bg-slate-700 px-3" onClick={() => void saveTeamName()} disabled={teamNamePending}>
                Save
              </button>
            </div>
            {teamNameError ? <p className="mt-2 text-xs text-red-300">{teamNameError}</p> : null}
          </div>

          <div className="mt-4 rounded bg-slate-800/60 p-3 text-left">
            <p className="mb-2 text-sm font-semibold">Your player name</p>
            <div className="flex gap-2">
              <input
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                className="flex-1 rounded bg-slate-800 px-2 py-2"
                placeholder="Enter your name"
                maxLength={24}
                disabled={namePending}
              />
              <button className="rounded bg-slate-700 px-3" onClick={() => void saveName()} disabled={namePending}>
                Save
              </button>
            </div>
            {nameError ? <p className="mt-2 text-xs text-red-300">{nameError}</p> : null}
          </div>

          <div className="mt-4 rounded bg-slate-800/60 p-3 text-left">
            <p className="mb-2 text-sm font-semibold">Team players</p>
            <ul className="space-y-1 text-sm">
              {teamPlayers.map((member) => (
                <li key={member.uid} className="flex items-center justify-between rounded bg-slate-900 px-2 py-1">
                  <span>{member.name}</span>
                  <span className={member.active ? "text-emerald-300" : "text-slate-400"}>{member.active ? "active" : "inactive"}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 border-t border-slate-700 pt-4">
            <button
              className="w-full rounded bg-emerald-700 px-3 py-2 font-medium"
              onClick={() => void joinGameNow()}
              disabled={isReadyForGame || joinGamePending || teamActionPending || namePending || teamNamePending}
            >
              {joinGamePending ? "Saving..." : game.status === "waiting" ? (isReadyForGame ? "Waiting to start" : "Ready for game") : "Join game"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <GameMap position={position} teams={teams} bars={bars} game={game} enabled={game.status === "running"} currentTeamId={teamId} />

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
              <div className="mt-1 text-xs text-slate-300">
                You: {teamId === b.team_a ? b.outcome_a ?? "-" : b.outcome_b ?? "-"} • Opponent: {teamId === b.team_a ? b.outcome_b ?? "-" : b.outcome_a ?? "-"}
              </div>
              {b.status === "disputed" ? <div className="mt-1 text-xs text-amber-300">Conflict: both teams reported the same outcome. Re-submit your result.</div> : null}
              <div className="mt-1 flex flex-wrap gap-1">
                <button className="rounded bg-slate-700 px-2" onClick={() => battle.setBattleType(battleId, "chug")}>Chug</button>
                <button className="rounded bg-slate-700 px-2" onClick={() => battle.setBattleType(battleId, "challenge")}>Challenge</button>
                <button className="rounded bg-emerald-700 px-2" onClick={() => battle.submitOutcome(battleId, "win")}>I won</button>
                <button className="rounded bg-rose-700 px-2" onClick={() => battle.submitOutcome(battleId, "lose")}>I lost</button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded border border-slate-700 p-2">
          <div className="mb-1 text-xs text-slate-300">Nearby active bars</div>
          {nearbyActiveBars.length === 0 ? (
            <div className="text-xs text-slate-400">No active bar within range right now.</div>
          ) : (
            <div className="space-y-1">
              {nearbyActiveBars.map(({ id, bar, distance }) => (
                <div key={id} className="flex items-center justify-between rounded bg-slate-900 px-2 py-1">
                  <span className="text-xs">{bar.name} ({Math.round(distance)}m)</span>
                  <button className="rounded bg-amber-700 px-2 text-xs" onClick={() => void markBarInactive(id)}>
                    Mark inactive
                  </button>
                </div>
              ))}
            </div>
          )}
          {barMessage ? <div className="mt-1 text-xs text-slate-300">{barMessage}</div> : null}
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

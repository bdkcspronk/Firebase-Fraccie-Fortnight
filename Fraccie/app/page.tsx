"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
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
import { TeamRanking } from "@/components/TeamRanking";
import { ChallengeButtonsClient } from "./ChallengeButtonsClient";
import { useBattleLossTimer } from "@/hooks/useBattleLossTimer";
import { LossTimerOverlay } from "@/components/LossTimerOverlay";



// Utility to darken a hex color
function darkenColor(hex: string, amount = 0.25) {
  if (!hex.startsWith('#')) return hex;
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  r = Math.floor(r * (1 - amount));
  g = Math.floor(g * (1 - amount));
  b = Math.floor(b * (1 - amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Utility to clamp color brightness
function clampColorBrightness(hex: string, maxValue = 0.8) {
  if (!hex.startsWith('#')) return hex;
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  if (max > maxValue) {
    const scale = maxValue / max;
    r *= scale;
    g *= scale;
    b *= scale;
  }
  r = Math.floor(r * 255);
  g = Math.floor(g * 255);
  b = Math.floor(b * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export default function HomePage() {
      // Listen for admin broadcast to delete all teams
      useEffect(() => {
        const broadcastRef = ref(db, 'broadcast/teamsDeleted');
        const handler = (snapshot: any) => {
          if (snapshot.exists()) {
            localStorage.removeItem('team_id');
            window.location.reload();
          }
        };
        import('firebase/database').then(({ onValue, off }) => {
          onValue(broadcastRef, handler);
          return () => off(broadcastRef, 'value', handler);
        });
      }, []);
    // Location permission state
    const [locationPermissionDenied, setLocationPermissionDenied] = useState(false);
  const { uid, teamId, team, loading, isAdmin, authError, joinTeamByName, teamActionPending, teamActionError, playerName, updatePlayerName, updateTeamName } = useAuthTeam();
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
  const [showSecretCodeInput, setShowSecretCodeInput] = useState(false);
  const [teamColorInput, setTeamColorInput] = useState(team?.color || '#38bdf8');
  
  useEffect(() => {
    if (team?.color) setTeamColorInput(team.color);
  }, [team?.color]);

  // Use clamped color for UI backgrounds
  const teamBgColor = team?.color ? darkenColor(clampColorBrightness(team.color, 0.8), 0.25) : '#1e293b';

  const updateTeamColor = async (color: string) => {
    if (!teamId) return;
    const clamped = clampColorBrightness(color, 0.8);
    setTeamColorInput(clamped);
    await update(ref(db, `teams/${teamId}`), { color: clamped });
  };
  
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
    return Object.entries((team && typeof team === "object" && "memberProfiles" in team ? team.memberProfiles : {}) ?? {}).map(([memberUid, profile]) => ({
      uid: memberUid,
      name: profile.name,
      active: now - profile.lastSeen <= 60_000
    }));
  }, [team]);

  // Stable bar proximity logic
  const [activeBarIds, setActiveBarIds] = useState<string[]>([]);

  useEffect(() => {
    if (!position) {
      setActiveBarIds([]);
      return;
    }
    const nowActive: string[] = [];
    Object.entries(bars).forEach(([id, bar]) => {
      const distance = distanceMeters(position.lat, position.lng, bar.lat, bar.lng);
      const wasActive = activeBarIds.includes(id);
      if (bar.active !== false) {
        if (distance <= bar.radius) {
          nowActive.push(id);
        } else if (wasActive && distance <= bar.radius * 1.5) {
          nowActive.push(id);
        }
      }
    });
    setActiveBarIds(nowActive);
  }, [bars, position]);

  const nearbyActiveBars = useMemo(() => {
    if (!position) return [] as Array<{ id: string; bar: Bar; distance: number }>;
    return activeBarIds.map((id) => {
      const bar = bars[id];
      const distance = distanceMeters(position.lat, position.lng, bar.lat, bar.lng);
      return { id, bar, distance };
    }).sort((left, right) => left.distance - right.distance);
  }, [activeBarIds, bars, position]);

  const winnerTeam = useMemo(() => {
    if (!game.winner_team_id) return null;
    return teams[game.winner_team_id] ?? null;
  }, [game.winner_team_id, teams]);

  const winnerMembers = useMemo(() => {
    if (!winnerTeam) return [] as Array<{ uid: string; name: string }>;

    const profiles = winnerTeam.memberProfiles ?? {};
    const memberIds = new Set<string>([
      ...Object.keys(winnerTeam.members ?? {}),
      ...Object.keys(profiles)
    ]);

    return Array.from(memberIds)
      .map((memberUid) => ({
        uid: memberUid,
        name: profiles[memberUid]?.name?.trim() || `Player-${memberUid.slice(0, 4)}`
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [winnerTeam]);
  
  const finalPlayerScoreboard = useMemo(() => {
    return Object.entries(teams)
      .flatMap(([entryTeamId, entryTeam]) => {
        if (!entryTeam || typeof entryTeam !== "object") return [];

        const profiles = entryTeam.memberProfiles ?? {};
        const memberIds = new Set<string>([
          ...Object.keys(entryTeam.members ?? {}),
          ...Object.keys(profiles)
        ]);

        const teamName = typeof entryTeam.name === "string" && entryTeam.name.trim()
          ? entryTeam.name
          : `Team-${entryTeamId.slice(0, 4)}`;
        const wins = Number.isFinite(entryTeam.wins) ? entryTeam.wins : 0;
        const losses = Number.isFinite(entryTeam.losses) ? entryTeam.losses : 0;

        return Array.from(memberIds).map((memberUid) => ({
          uid: memberUid,
          playerName: profiles[memberUid]?.name?.trim() || `Player-${memberUid.slice(0, 4)}`,
          teamName,
          wins,
          losses
        }));
      })
      .sort((left, right) => {
        if (right.wins !== left.wins) return right.wins - left.wins;
        if (left.losses !== right.losses) return left.losses - right.losses;
        return left.playerName.localeCompare(right.playerName);
      });
  }, [teams]);

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
      // Find teams with members near the bar
      const bar = bars[barId];
      if (!bar) throw new Error("Bar not found.");
      const nearbyTeams: string[] = [];
      Object.entries(teams).forEach(([tid, t]) => {
        const memberLocs = t.memberLocations ?? {};
        const isNear = Object.values(memberLocs).some(loc => {
          const dist = distanceMeters(loc.lat, loc.lng, bar.lat, bar.lng);
          return dist <= bar.radius;
        });
        if (isNear) nearbyTeams.push(tid);
      });

      // Only allow marking inactive if one team is near
      if (nearbyTeams.length > 1) {
        setBarMessage("Multiple teams are near this bar. You must challenge first.");
        return;
      }

      await update(ref(db, `bars/${barId}`), {
        active: false,
        clearedAt: Date.now(),
        clearedBy: teamId
      });

      // Increment team's wins
      if (teamId) {
        const currentWins = teams[teamId]?.wins ?? 0;
        await update(ref(db, `teams/${teamId}`), {
          wins: currentWins + 1
        });
      }

      setBarMessage("Bar marked searched.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to mark bar searched.";
      setBarMessage(message);
    }
  };

  // Top-of-screen action popups for in-game actions
  const canMarkBarInactive = nearbyActiveBars.length > 0;
  const canChallengeTeam = battle.availableTeamIds.length > 0;
  const challengeTeamId = canChallengeTeam ? battle.availableTeamIds[0] : null;
  const challengeTeamName = challengeTeamId ? (teams[challengeTeamId]?.name ?? challengeTeamId.slice(0, 4)) : "";
  const safeTeamId = teamId ?? "";
  const lossTimerMs = useBattleLossTimer(battles, safeTeamId);
  
  if (loading) return <main className="p-4">Loading...</main>;

  // Location permission banner
  if (locationPermissionDenied) {
    return (
      <main className="grid h-screen place-items-center p-6 text-center">
        <div className="w-full max-w-xl rounded bg-rose-900 p-4">
          <h1 className="mb-2 text-xl">Location Required</h1>
          <p className="text-slate-100">This game needs your location to work. Please enable location permissions in your browser settings and reload the page.</p>
        </div>
      </main>
    );
  }

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
      // Prompt for location permission
      if (!navigator.geolocation) {
        setLocationPermissionDenied(true);
        setJoinGamePending(false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        () => {
          setLocationPermissionDenied(false);
          setIsReadyForGame(true);
          localStorage.setItem(GAME_READY_STORAGE_KEY, "true");
          setJoinGamePending(false);
        },
        (err) => {
          if (err.code === 1) setLocationPermissionDenied(true); // PERMISSION_DENIED
          setIsReadyForGame(false);
          setJoinGamePending(false);
        }
      );
    };

    const waitingBgColor = team?.color ? darkenColor(clampColorBrightness(team.color, 0.8), 0.35) : '#1e293b';
    const waitingPanelColor = team?.color ? darkenColor(clampColorBrightness(team.color, 0.8), 0.5) : '#0f172a';
    // Get other teams (exclude current team)
    const otherTeams = Object.entries(teams).filter(([tid]) => tid !== teamId);
    const inputBgColor = team?.color ? darkenColor(clampColorBrightness(team.color, 0.8), 0.7) : '#0a101a';
    const memberBgColor = team?.color ? darkenColor(clampColorBrightness(team.color, 0.8), 0.5) : '#1e293b';
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center" style={{ background: waitingBgColor }}>
        <div className="w-full max-w-xl rounded" style={{ background: waitingPanelColor, color: 'var(--color-text-primary)' }}>
          <div className="p-5 flex flex-col gap-6">
            {/* Logo and game status */}
            <div className="flex flex-col items-center gap-2">
              <img src={logoImage.src} alt="Fraccie logo" className="h-24 w-24" />
              <h1 className="text-xl">Waiting for The Game start…</h1>
            </div>

            {/* Player section FIRST */}
            <section className="rounded bg-black/20 p-4 text-left flex flex-col gap-3">
              <div className="font-semibold text-lg mb-2">Your player name</div>
              <div className="flex gap-2">
                <input
                  value={nameInput}
                  onChange={(event) => setNameInput(event.target.value)}
                  className="flex-1 rounded px-2 py-2"
                  style={{ background: inputBgColor, color: 'var(--color-text-primary)' }}
                  placeholder="Edit your name"
                  maxLength={24}
                  disabled={namePending}
                />
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  className="rounded bg-slate-700 px-3"
                  onClick={() => void saveName()}
                  disabled={namePending}
                >
                  Save
                </motion.button>
              </div>
              {nameError ? <p className="text-xs text-red-300">{nameError}</p> : null}
            </section>

            {/* Team section */}
            <section className="rounded bg-black/20 p-4 text-left flex flex-col gap-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-lg mb-2">Your team</span>
                <span className="text-sm text-slate-400">Players {teamPlayers.length}</span>
              </div>
              <div className="flex gap-2">
                <input
                  value={teamNameInput}
                  onChange={(event) => setTeamNameInput(event.target.value)}
                  className="flex-1 rounded px-2 py-2"
                  style={{ background: inputBgColor, color: 'var(--color-text-primary)' }}
                  placeholder="Edit team name"
                  maxLength={32}
                  disabled={teamNamePending}
                />
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  className="rounded bg-slate-700 px-3"
                  onClick={() => void saveTeamName()}
                  disabled={teamNamePending}
                >
                  Save
                </motion.button>
              </div>
              <div className="flex gap-2 items-center mb-2">
                <span className="text-sm">Team color:</span>
                <div className="flex-1" />
                <input
                  id="team-color-picker"
                  type="color"
                  value={teamColorInput}
                  onChange={e => updateTeamColor(e.target.value)}
                  className="w-8 h-8 p-0 border-none bg-transparent cursor-pointer"
                  style={{ background: 'none' }}
                />
              </div>
              {teamNameError ? <p className="text-xs text-red-300">{teamNameError}</p> : null}
              <div className="mt-2">
                <p className="mb-1 text-sm font-semibold">Team {team?.name || (teamId ? `Team-${teamId.slice(0, 4)}` : "")} members:</p>
                <ul className="space-y-1 text-sm">
                  {teamPlayers.map((member) => (
                    <li
                      key={member.uid}
                      className="flex items-center justify-between rounded px-2 py-1"
                      style={{ background: memberBgColor }}
                    >
                      <span>{member.name}</span>
                      <span className={member.active ? "text-emerald-300" : "text-slate-400"}>{member.active ? "active" : "inactive"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* Join another team section */}
            <section className="rounded bg-black/20 p-4 text-left flex flex-col gap-3">
              <p className="mb-1 text-sm font-semibold">Join another team</p>
              <div className="flex gap-2">
                <input
                  value={joinCodeInput}
                  onChange={(event) => setJoinCodeInput(event.target.value)}
                  className="flex-1 rounded px-2 py-2"
                  style={{ background: inputBgColor, color: 'var(--color-text-primary)' }}
                  placeholder="Enter team name"
                  maxLength={32}
                  disabled={teamActionPending}
                />
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  className="rounded bg-emerald-700 px-3"
                  onClick={() => void joinTeamByName(joinCodeInput)}
                  disabled={teamActionPending}
                >
                  Join
                </motion.button>
              </div>
              {teamActionError ? <p className="text-xs text-red-300">{teamActionError}</p> : null}
            </section>

            {/* Ready for game section */}
            <section className="mt-2">
              <motion.button
                whileTap={{ scale: 0.96 }}
                className="w-full rounded bg-emerald-700 px-3 py-2 font-medium"
                onClick={() => void joinGameNow()}
                disabled={isReadyForGame || joinGamePending || teamActionPending || namePending || teamNamePending}
              >
                {joinGamePending ? "Saving..." : game.status === "waiting" ? (isReadyForGame ? "Waiting to start" : "Ready for game") : "Join game"}
              </motion.button>
            </section>

            {/* Other teams section */}
            {otherTeams.length > 0 && (
              <section className="mt-4">
                <div className="mb-2 text-sm font-semibold">Other teams</div>
                <div className="flex flex-col gap-2">
                  {otherTeams.map(([tid, t]) => (
                    <div key={tid} className="flex items-center gap-3 rounded bg-black/10 px-3 py-2">
                      <span className="w-5 h-5 rounded-full border border-slate-700" style={{ background: t.color || '#888' }} />
                      <span className="font-semibold text-base">{t.name || tid.slice(0, 4)}</span>
                      <span className="text-xs text-slate-400">{Object.keys(t.members ?? {}).length} Players</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    );
  }
  

  return (
    <main className="relative h-screen w-screen overflow-hidden" style={{ background: teamBgColor }}>
      {/* Team name and stats at the top */}
      <section className="absolute left-0 right-0 top-0 z-10 flex flex-col items-center" style={{ background: teamBgColor }}>
        <div className="w-full py-6 px-4 text-3xl font-extrabold tracking-wide text-center rounded-b-xl shadow-lg team-header" style={{ color: 'var(--color-text-primary)', letterSpacing: '0.05em' }}>
          {team.name}
        </div>
        {/* Team ranking - collapsible */}
        <TeamRanking teams={teams} currentTeamId={teamId} showRankingDefault={false} />
      </section>

      {/* Loss timer overlay */}
      <LossTimerOverlay ms={lossTimerMs ?? 0} />

      <GameMap position={position} teams={teams} bars={bars} game={game} enabled={game.status === "running"} interactive currentTeamId={teamId} />

      {/* Challenge team buttons - now centered on screen with scale-in animation (client-only) */}
      {game.status === "running" && battle.availableTeamIds.length > 0 && (
        <ChallengeButtonsClient
          availableTeamIds={battle.availableTeamIds}
          teams={teams}
          onChallenge={battle.startBattle}
        />
      )}

      {/* Actions section at the bottom */}
      <section className="absolute bottom-0 left-0 right-0 flex flex-col gap-3 rounded p-3 text-sm" style={{ background: teamBgColor }}>

        {/* Challenge outcome bar for pending/submitted battles - centered on screen */}
        {game.status === "running" && myPendingBattles.length > 0 && (
          <div className="fixed inset-0 flex items-center justify-center z-30 pointer-events-none">
            <div className="rounded bg-slate-800/80 p-3 flex flex-col gap-2 w-full max-w-xl px-4 pointer-events-auto shadow-2xl border border-slate-700">
              {myPendingBattles.map(([battleId, b]) => {
                const opponentId = b.team_a === teamId ? b.team_b : b.team_a;
                const opponentName = teams[opponentId]?.name ?? opponentId.slice(0, 4);
                const alreadySubmitted = (b.team_a === teamId ? b.outcome_a : b.outcome_b) ?? null;
                return (
                  <div key={battleId} className="flex flex-col gap-2">
                    <div className="font-bold text-base text-center">Chug Challenge vs {opponentName}</div>
                    <div className="flex gap-2 justify-center">
                      <button
                        className={`rounded px-4 py-2 font-bold ${alreadySubmitted === "win" ? "bg-emerald-700" : "bg-slate-700"}`}
                        style={{ color: 'var(--color-text-primary)' }}
                        disabled={!!alreadySubmitted}
                        onClick={() => battle.submitOutcome(battleId, "win")}
                      >
                        I won
                      </button>
                      <button
                        className={`rounded px-4 py-2 font-bold ${alreadySubmitted === "lose" ? "bg-slate-700" : "bg-slate-700"}`}
                        style={{ color: 'var(--color-text-primary)' }}
                        disabled={!!alreadySubmitted}
                        onClick={() => battle.submitOutcome(battleId, "lose")}
                      >
                        I lost
                      </button>
                    </div>
                    {alreadySubmitted ? (
                      <div className="text-xs text-center text-slate-300">Waiting for opponent to submit outcome…</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Nearby active bars - only show if player is in radius of 1+ bars */}
        {game.status === "running" && nearbyActiveBars.length > 0 && (
          <div className="rounded" style={{ background: teamBgColor }}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-slate-300">Nearby unsearched bars</span>
              <span className="text-xs text-slate-400 text-right">Currently searched: {Object.values(bars).filter(bar => bar.active == false).length} / {Object.keys(bars).length} bars</span>
            </div>
            <div className="space-y-1">
              {nearbyActiveBars.map(({ id, bar, distance }) => (
                <div
                  key={id}
                  className="flex items-center justify-between rounded px-2 py-1"
                  style={{ background: bar.active === false ? '#000' : teamBgColor }}
                >
                  <span className="text-xs">{bar.name} ({Math.round(distance)}m)</span>
                  {(() => {
                    // Find teams with members near the bar
                    const barObj = bars[id];
                    const nearbyTeams = Object.entries(teams).filter(([tid, t]) => {
                      const memberLocs = t.memberLocations ?? {};
                      return Object.values(memberLocs).some(loc => {
                        const dist = distanceMeters(loc.lat, loc.lng, barObj.lat, barObj.lng);
                        return dist <= barObj.radius;
                      });
                    });
                    const multipleTeamsNear = nearbyTeams.length > 1;
                    return (
                      <button
                        className="rounded bg-amber-700 px-4 py-3 text-xs"
                        style={{ color: 'var(--color-text-primary)' }}
                        onClick={() => void (!multipleTeamsNear && markBarInactive(id))}
                        disabled={multipleTeamsNear}
                      >
                        {multipleTeamsNear ? 'Must challenge' : 'Mark searched (chug!)'}
                      </button>
                    );
                  })()}
                </div>
              ))}
            </div>
            {barMessage && !barMessage.includes('Multiple teams are near') ? (
              <div className="mt-1 text-xs text-slate-300">{barMessage}</div>
            ) : null}
          </div>
        )}

        {/* Found the chickens button and secret code input */}
        {game.status === "running" && (
          <div className="flex flex-col gap-2 items-center">
            {!showSecretCodeInput && (
              <button
                className="w-full rounded font-bold px-2 py-5 found-chickens-btn"
                onClick={() => setShowSecretCodeInput(true)}
              >
                Found the chickens!
              </button>
            )}
            {showSecretCodeInput && (
              <div className="flex gap-2 w-full">
                <input
                  value={codeInput}
                  onChange={(event) => setCodeInput(event.target.value)}
                  className="flex-1 rounded bg-slate-800 px-2 py-2"
                  placeholder="Enter secret code"
                  disabled={game.status !== "running"}
                />
                <button className="rounded bg-green-700 px-3" style={{ color: 'var(--color-text-primary)' }} onClick={submitCode} disabled={game.status !== "running"}>
                  Submit
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {game.status === "finished" ? (
        <div className="absolute inset-0 bg-black/75 p-4">
          <div className="mx-auto flex h-full max-w-3xl items-center justify-center">
            <div className="w-full rounded-xl border border-slate-700 bg-slate-900/95 p-5 text-slate-100 shadow-2xl">
              <h2 className="text-center text-2xl font-bold">Chickens found 🐔</h2>
              <p className="mt-1 text-center text-lg">
                Winner: {winnerTeam?.name ?? (game.winner_team_id ? `Team-${game.winner_team_id.slice(0, 4)}` : "Unknown team")}
              </p>
              {winnerTeam ? <p className="mt-1 text-center text-sm text-slate-300">{winnerTeam.wins} Wins - {winnerTeam.losses} Losses</p> : null}

              <div className="mt-5">
                <div className="mb-2 text-sm font-semibold">Winning team members</div>
                {winnerMembers.length === 0 ? (
                  <div className="text-xs text-slate-400">No member names available.</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {winnerMembers.map((member) => (
                      <span key={member.uid} className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-100">
                        {member.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-5">
                <div className="mb-2 text-sm font-semibold">Final player scoreboard</div>
                <div className="max-h-64 overflow-auto rounded border border-slate-700">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-800/80 text-slate-200">
                      <tr>
                        <th className="px-2 py-2">Player</th>
                        <th className="px-2 py-2">Team</th>
                        <th className="px-2 py-2">Final score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finalPlayerScoreboard.map((row) => (
                        <tr key={row.uid} className="border-t border-slate-800/70">
                          <td className="px-2 py-1.5">{row.playerName}</td>
                          <td className="px-2 py-1.5 text-slate-300">{row.teamName}</td>
                          <td className="px-2 py-1.5 font-medium">{row.wins} Wins - {row.losses} Losses</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

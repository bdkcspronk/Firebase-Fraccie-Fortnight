"use client";

import { useEffect, useMemo, useState } from "react";
import { push, ref, set, update } from "firebase/database";
import { useAuthTeam } from "@/hooks/useAuthTeam";
import { useGameState } from "@/hooks/useGameState";
import { useRealtimeCollection } from "@/hooks/useRealtimeCollection";
import { GameMap } from "@/components/GameMap";
import { adminDeleteAllTeams, adminDeleteTeam, adminEndGame, adminOverrideBattle, adminPruneInactiveTeams, adminResetGame, adminSetCircleCenter, adminSetCircleRadius, adminSetEnemyVisibility, adminStartGame } from "@/lib/admin";
import { db } from "@/lib/firebase";
import { Bar, Battle, Team } from "@/lib/types";

const TEAM_ACTIVE_WINDOW_MS = 60_000;
const TEAM_INACTIVE_DELETE_MS = 10 * 60_000;

const formatLastActive = (lastSeen: number | null) => {
  if (!lastSeen) return "unknown";
  const seconds = Math.floor((Date.now() - lastSeen) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
};

export default function AdminPage() {
  const { isAdmin, uid, loading, authError } = useAuthTeam({ bootstrapTeam: false });
  const game = useGameState();
  const teams = useRealtimeCollection<Team>("teams", Boolean(uid));
  const bars = useRealtimeCollection<Bar>("bars", Boolean(uid));
  const battles = useRealtimeCollection<Battle>("battles", Boolean(uid));
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);
  const [prunePending, setPrunePending] = useState(false);
  const [deleteAllPending, setDeleteAllPending] = useState(false);
  const [pruneMessage, setPruneMessage] = useState<string | null>(null);
  const [centerLatInput, setCenterLatInput] = useState(String(game.circle_center_lat));
  const [centerLngInput, setCenterLngInput] = useState(String(game.circle_center_lng));
  const [addressInput, setAddressInput] = useState("");
  const [centerPending, setCenterPending] = useState(false);
  const [centerMessage, setCenterMessage] = useState<string | null>(null);
  const [addressPending, setAddressPending] = useState(false);
  const [radiusInput, setRadiusInput] = useState(String(game.circle_radius));
  const [radiusPending, setRadiusPending] = useState(false);
  const [radiusMessage, setRadiusMessage] = useState<string | null>(null);
  const [barsInput, setBarsInput] = useState("");
  const [barsPending, setBarsPending] = useState(false);
  const [barsMessage, setBarsMessage] = useState<string | null>(null);
  const [globalBarRadius, setGlobalBarRadius] = useState("");
  const [globalBarRadiusPending, setGlobalBarRadiusPending] = useState(false);
  const [globalBarRadiusMessage, setGlobalBarRadiusMessage] = useState<string | null>(null);
    const deleteBar = async (barId: string) => {
      if (!confirm("Delete this bar? This will permanently remove it from the database.")) return;
      await set(ref(db, `bars/${barId}`), null);
    };

    const updateAllBarRadius = async () => {
      const radius = Number(globalBarRadius);
      if (!Number.isFinite(radius) || radius < 1) {
        setGlobalBarRadiusMessage("Enter a valid radius of at least 1m.");
        return;
      }
      setGlobalBarRadiusPending(true);
      setGlobalBarRadiusMessage(null);
      try {
        const updates: Record<string, number> = {};
        for (const [barId] of barRows) {
          updates[`bars/${barId}/radius`] = radius;
        }
        await update(ref(db), updates);
        setGlobalBarRadiusMessage("Updated radius for all bars.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update bar radii.";
        setGlobalBarRadiusMessage(message);
      } finally {
        setGlobalBarRadiusPending(false);
      }
    };
  const [uidCopyMessage, setUidCopyMessage] = useState<string | null>(null);
  const [enemyVisibilityPending, setEnemyVisibilityPending] = useState(false);

  useEffect(() => {
    if (centerPending) return;
    setCenterLatInput(String(game.circle_center_lat));
    setCenterLngInput(String(game.circle_center_lng));
  }, [game.circle_center_lat, game.circle_center_lng, centerPending]);

  useEffect(() => {
    if (radiusPending) return;
    setRadiusInput(String(Math.round(game.circle_radius)));
  }, [game.circle_radius, radiusPending]);

  const teamRows = useMemo(() => {
    return Object.entries(teams)
      .flatMap(([teamId, team]) => {
        if (!team || typeof team !== "object") return [];

        const members = team.members && typeof team.members === "object" ? team.members : {};
        const memberProfiles = team.memberProfiles && typeof team.memberProfiles === "object" ? team.memberProfiles : {};
        const memberCount = Object.keys(members).length;
        const memberNames = Object.keys(members).map((memberUid) => {
          const profile = memberProfiles[memberUid];
          const name = profile && typeof profile === "object" ? String((profile as { name?: unknown }).name ?? "") : "";
          return name.trim() || `Player-${memberUid.slice(0, 4)}`;
        });
        const lastSeenValues = Object.values(memberProfiles)
          .map((profile) => (profile && typeof profile === "object" ? Number((profile as { lastSeen?: unknown }).lastSeen) : NaN))
          .filter((lastSeen) => Number.isFinite(lastSeen));
        const lastActiveAt = lastSeenValues.length ? Math.max(...lastSeenValues) : null;
        const active = lastActiveAt ? Date.now() - lastActiveAt <= TEAM_ACTIVE_WINDOW_MS : false;
        const inactiveForDelete = !lastActiveAt || Date.now() - lastActiveAt >= TEAM_INACTIVE_DELETE_MS;

        return [{
          teamId,
          team,
          memberCount,
          memberNames,
          lastActiveAt,
          active,
          inactiveForDelete
        }];
      })
      .sort((left, right) => (right.lastActiveAt ?? 0) - (left.lastActiveAt ?? 0));
  }, [teams]);

  const barRows = useMemo(
    () =>
      Object.entries(bars).flatMap(([barId, bar]) => {
        if (!bar || typeof bar !== "object") return [];
        if (typeof bar.name !== "string") return [];
        if (!Number.isFinite(bar.lat) || !Number.isFinite(bar.lng) || !Number.isFinite(bar.radius)) return [];
        return [[barId, bar] as const];
      }),
    [bars]
  );

  const battleRows = useMemo(
    () =>
      Object.entries(battles).flatMap(([battleId, battle]) => {
        if (!battle || typeof battle !== "object") return [];
        if (typeof battle.team_a !== "string" || typeof battle.team_b !== "string") return [];
        return [[battleId, battle] as const];
      }),
    [battles]
  );

  const deleteTeam = async (teamId: string, joinCode?: string) => {
    if (!confirm("Delete this inactive team? This also removes related battles.")) return;

    setDeletingTeamId(teamId);
    try {
      await adminDeleteTeam(teamId, joinCode);
    } finally {
      setDeletingTeamId(null);
    }
  };

  const pruneInactiveTeams = async () => {
    setPrunePending(true);
    setPruneMessage(null);
    try {
      const removedCount = await adminPruneInactiveTeams();
      setPruneMessage(removedCount ? `Pruned ${removedCount} inactive team(s).` : "No teams inactive for 10+ minutes to prune.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to prune inactive teams.";
      setPruneMessage(message);
    } finally {
      setPrunePending(false);
    }
  };

  const deleteAllTeams = async () => {
    if (!confirm("Delete ALL teams and related battles? This cannot be undone.")) return;

    setDeleteAllPending(true);
    setPruneMessage(null);
    try {
      const removedCount = await adminDeleteAllTeams();
      setPruneMessage(removedCount ? `Deleted ${removedCount} team(s).` : "No teams to delete.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete all teams.";
      setPruneMessage(message);
    } finally {
      setDeleteAllPending(false);
    }
  };

  const setCircleCenter = async () => {
    const lat = Number(centerLatInput);
    const lng = Number(centerLngInput);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setCenterMessage("Enter valid coordinates (lat: -90..90, lng: -180..180).");
      return;
    }

    setCenterPending(true);
    setCenterMessage(null);
    try {
      await adminSetCircleCenter(lat, lng);
      setCenterMessage("Circle center updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update circle center.";
      setCenterMessage(message);
    } finally {
      setCenterPending(false);
    }
  };

  const setCenterFromAddress = async () => {
    const query = addressInput.trim();
    if (!query) {
      setCenterMessage("Enter an address first.");
      return;
    }

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setCenterMessage("Mapbox token is missing.");
      return;
    }

    setAddressPending(true);
    setCenterMessage(null);
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=1`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Address lookup failed.");

      const data = (await response.json()) as {
        features?: Array<{ center?: [number, number] }>;
      };

      const first = data.features?.[0]?.center;
      if (!first || first.length < 2) {
        setCenterMessage("Address not found.");
        return;
      }

      const [lng, lat] = first;
      setCenterLatInput(String(lat));
      setCenterLngInput(String(lng));
      await adminSetCircleCenter(lat, lng);
      setCenterMessage("Circle center updated from address.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to set center from address.";
      setCenterMessage(message);
    } finally {
      setAddressPending(false);
    }
  };

  const setCircleRadius = async () => {
    const radius = Number(radiusInput);

    if (!Number.isFinite(radius) || radius < 1) {
      setRadiusMessage("Enter a valid radius of at least 1m.");
      return;
    }

    setRadiusPending(true);
    setRadiusMessage(null);
    try {
      await adminSetCircleRadius(radius);
      setRadiusMessage("Circle radius updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update circle radius.";
      setRadiusMessage(message);
    } finally {
      setRadiusPending(false);
    }
  };

  const importBars = async () => {
    const lines = barsInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      setBarsMessage("Paste at least one line first.");
      return;
    }

    setBarsPending(true);
    setBarsMessage(null);

    try {
      let imported = 0;

      for (const [lineIndex, line] of lines.entries()) {
        const parts = line.split(",").map((part) => part.trim());
        let name = `Bar ${lineIndex + 1}`;
        let lat = 0;
        let lng = 0;
        let radius = 40;

        if (parts.length === 2) {
          lat = Number(parts[0]);
          lng = Number(parts[1]);
        } else if (parts.length === 3) {
          const maybeLat = Number(parts[0]);
          const maybeLng = Number(parts[1]);
          if (Number.isFinite(maybeLat) && Number.isFinite(maybeLng)) {
            lat = maybeLat;
            lng = maybeLng;
            radius = Number(parts[2]);
          } else {
            name = parts[0];
            lat = Number(parts[1]);
            lng = Number(parts[2]);
          }
        } else if (parts.length >= 4) {
          name = parts[0] || name;
          lat = Number(parts[1]);
          lng = Number(parts[2]);
          radius = Number(parts[3]);
        } else {
          throw new Error(`Invalid format on line ${lineIndex + 1}`);
        }

        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          throw new Error(`Invalid coordinates on line ${lineIndex + 1}`);
        }

        if (!Number.isFinite(radius) || radius <= 0) {
          radius = 40;
        }

        const barRef = push(ref(db, "bars"));
        await set(barRef, {
          name,
          lat,
          lng,
          radius,
          active: true
        } satisfies Bar);
        imported += 1;
      }

      setBarsMessage(`Imported ${imported} bar(s).`);
      setBarsInput("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import bars.";
      setBarsMessage(message);
    } finally {
      setBarsPending(false);
    }
  };

  const setBarActive = async (barId: string, active: boolean) => {
    await update(ref(db, `bars/${barId}`), {
      active,
      clearedAt: active ? null : Date.now(),
      clearedBy: active ? null : uid
    });
  };

  const copyUid = async () => {
    if (!uid) return;
    try {
      await navigator.clipboard.writeText(uid);
      setUidCopyMessage("UID copied.");
    } catch {
      setUidCopyMessage("Copy failed. Please copy manually.");
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

  if (!uid) return <main className="p-4">Unable to resolve user session.</main>;

  if (!isAdmin) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 p-6">
        <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900/95 p-5 text-left shadow-xl">
          <h1 className="text-xl font-semibold text-slate-100">Admin Access Required</h1>
          <p className="mt-2 text-sm text-slate-300">This device is signed in, but the UID is not whitelisted as admin yet.</p>

          <div className="mt-4 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200">
            <div className="mb-1 text-slate-400">Current UID</div>
            <div className="break-all font-mono tracking-wide">{uid}</div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500" onClick={() => void copyUid()}>
              Copy UID
            </button>
            {uidCopyMessage && <span className="text-xs text-emerald-300">{uidCopyMessage}</span>}
          </div>

          <div className="mt-4 rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-xs text-slate-300">
            <div className="mb-1 font-medium text-slate-200">How to enable admin</div>
            <ol className="list-decimal space-y-1 pl-4">
              <li>Open Firebase Console → Realtime Database.</li>
              <li>Add or set admins/{uid} to true.</li>
              <li>Refresh this page.</li>
            </ol>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen space-y-3 bg-slate-950 p-4 text-sm text-slate-100">
      <h1 className="text-xl">Admin panel</h1>
      <div>Status: {game.status}</div>
      <div>Radius: {Math.round(game.circle_radius)}m</div>
      <div>Enemy popup visibility: {game.enemy_visibility ? "On" : "Off"}</div>

      {/* Admin UID display */}
      <section className="rounded border border-slate-700 bg-slate-900/80 p-3 mb-3">
        <div className="mb-1 text-slate-400">Your database UID</div>
        <div className="break-all font-mono tracking-wide text-xs text-slate-200">{uid}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500" onClick={() => void copyUid()}>
            Copy UID
          </button>
          {uidCopyMessage && <span className="text-xs text-emerald-300">{uidCopyMessage}</span>}
        </div>
      </section>


      <div className="flex flex-wrap gap-2">
        <button className="rounded bg-green-700 px-3 py-2" onClick={() => adminStartGame()}>Start game</button>
        <button className="rounded bg-amber-700 px-3 py-2" onClick={() => adminEndGame()}>End game</button>
        <button className="rounded bg-red-700 px-3 py-2" onClick={() => adminResetGame()}>Reset game</button>
        <button
          className={`rounded px-3 py-2 ${game.enemy_visibility ? "bg-slate-700" : "bg-indigo-700"}`}
          onClick={() => {
            setEnemyVisibilityPending(true);
            void adminSetEnemyVisibility(!(game.enemy_visibility === true)).finally(() => setEnemyVisibilityPending(false));
          }}
          disabled={enemyVisibilityPending}
        >
          {enemyVisibilityPending ? "Saving..." : game.enemy_visibility ? "Hide enemy popups" : "Show enemy popups"}
        </button>
      </div>

      <section className="rounded border border-slate-700 p-3">
        <h2 className="mb-2 font-semibold">Circle Radius</h2>
        <div className="mb-2 text-xs text-slate-400">Current: {Math.round(game.circle_radius)}m</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={radiusInput}
            onChange={(event) => setRadiusInput(event.target.value)}
            className="rounded bg-slate-900 px-2 py-1"
            placeholder="Radius in meters"
          />
          <button className="rounded bg-indigo-700 px-3 py-1" onClick={() => void setCircleRadius()} disabled={radiusPending}>
            {radiusPending ? "Saving..." : "Set radius"}
          </button>
        </div>
        {radiusMessage ? <div className="mt-2 text-xs text-slate-300">{radiusMessage}</div> : null}
      </section>

      <section className="rounded border border-slate-700 p-3">
        <h2 className="mb-2 font-semibold">Circle Center</h2>
        <div className="mb-2 text-xs text-slate-400">Current: {game.circle_center_lat}, {game.circle_center_lng}</div>
        <div className="mb-2 flex flex-wrap gap-2">
          <input
            value={addressInput}
            onChange={(event) => setAddressInput(event.target.value)}
            className="min-w-[260px] flex-1 rounded bg-slate-900 px-2 py-1"
            placeholder="Address (e.g. Dam Square Amsterdam)"
          />
          <button className="rounded bg-indigo-700 px-3 py-1" onClick={() => void setCenterFromAddress()} disabled={addressPending}>
            {addressPending ? "Looking up..." : "Set from address"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
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
          <button className="rounded bg-emerald-700 px-3 py-1" onClick={() => void setCircleCenter()} disabled={centerPending}>
            {centerPending ? "Saving..." : "Set center"}
          </button>
        </div>
        {centerMessage ? <div className="mt-2 text-xs text-slate-300">{centerMessage}</div> : null}
      </section>

      <section className="rounded border border-slate-700 p-3">
        <h2 className="mb-2 font-semibold">Bars</h2>
        <p className="mb-2 text-xs text-slate-400">Paste one bar per line: <strong>lat,lng</strong> or <strong>name,lat,lng,radius</strong>.</p>
        <textarea
          value={barsInput}
          onChange={(event) => setBarsInput(event.target.value)}
          className="min-h-24 w-full rounded bg-slate-900 p-2"
          placeholder={"53.216323,6.556997\nMain Bar,53.218000,6.560000,50"}
        />
        <div className="mt-2 flex gap-2">
          <button className="rounded bg-indigo-700 px-3 py-1" onClick={() => void importBars()} disabled={barsPending}>
            {barsPending ? "Importing..." : "Import bars"}
          </button>
        </div>
        {barsMessage ? <div className="mt-2 text-xs text-slate-300">{barsMessage}</div> : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={globalBarRadius}
            onChange={(e) => setGlobalBarRadius(e.target.value)}
            className="rounded bg-slate-900 px-2 py-1"
            placeholder="Set all bars radius (m)"
            type="number"
            min={20}
          />
          <button className="rounded bg-indigo-700 px-3 py-1" onClick={() => void updateAllBarRadius()} disabled={globalBarRadiusPending}>
            {globalBarRadiusPending ? "Updating..." : "Set all bars radius"}
          </button>
          {globalBarRadiusMessage ? <span className="text-xs text-slate-300">{globalBarRadiusMessage}</span> : null}
        </div>

        <div className="mt-3 max-h-64 overflow-y-auto space-y-1">
          {barRows.map(([barId, bar]) => (
            <div key={barId} className="flex items-center justify-between rounded bg-slate-900 p-2 text-xs">
              <span>{bar.name} • r={Math.round(bar.radius)}m • {bar.lat.toFixed(5)}, {bar.lng.toFixed(5)}</span>
              <div className="flex gap-2">
                <button
                  className={`rounded px-2 py-1 ${bar.active === false ? "bg-emerald-700" : "bg-amber-700"}`}
                  onClick={() => void setBarActive(barId, bar.active === false)}
                >
                  {bar.active === false ? "Set active" : "Set inactive"}
                </button>
                <button
                  className="rounded bg-red-800 px-2 py-1"
                  onClick={() => void deleteBar(barId)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border border-slate-700 p-3">
        <h2 className="mb-2 font-semibold">Teams</h2>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button className="rounded bg-slate-700 px-3 py-1" onClick={() => void pruneInactiveTeams()} disabled={prunePending || deleteAllPending}>
              {prunePending ? "Pruning..." : "Prune inactive"}
            </button>
            <button className="rounded bg-red-800 px-3 py-1" onClick={() => void deleteAllTeams()} disabled={deleteAllPending || prunePending}>
              {deleteAllPending ? "Deleting..." : "Delete all teams"}
            </button>
          </div>
        </div>
        <p className="mb-2 text-xs text-slate-400">Reset W/L resets a team's wins/losses score back to 0/0. Prune removes teams inactive for 10+ minutes (or with zero members).</p>
        {pruneMessage ? <div className="mb-2 text-xs text-slate-300">{pruneMessage}</div> : null}
        <div className="space-y-1">
          {teamRows.map(({ teamId, team, memberCount, memberNames, lastActiveAt, active, inactiveForDelete }) => (
            <div key={teamId} className="flex items-center justify-between gap-3 rounded bg-slate-900 p-2">
              <div>
                <div>{team.name} ({teamId.slice(0, 6)})</div>
                <div className="text-xs text-slate-400">
                  Members: {memberCount} • Last active: {formatLastActive(lastActiveAt)} • {active ? "active" : "inactive"}
                </div>
                <div className="text-xs text-slate-500">
                  Members: {memberNames.length ? memberNames.join(", ") : "none"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded bg-slate-700 px-2"
                  onClick={() =>
                    update(ref(db), {
                      [`teams/${teamId}/wins`]: 0,
                      [`teams/${teamId}/losses`]: 0
                    })
                  }
                >
                  Reset score
                </button>
                {inactiveForDelete ? (
                  <button
                    className="rounded bg-red-800 px-2"
                    onClick={() => void deleteTeam(teamId, team.joinCode)}
                    disabled={deletingTeamId === teamId}
                  >
                    {deletingTeamId === teamId ? "Deleting..." : "Delete"}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border border-slate-700 p-3">
        <h2 className="mb-2 font-semibold">Battles</h2>
        <div className="space-y-2">
          {battleRows.map(([battleId, battle]) => (
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

      <section className="rounded border border-slate-700 p-3">
        <h2 className="mb-2 font-semibold">Live Map</h2>
          <div className="h-[70vh] overflow-hidden rounded border border-slate-800">
            <GameMap
              position={{ lat: game.circle_center_lat, lng: game.circle_center_lng }}
              teams={teams}
              bars={bars}
              game={game}
              enabled
              interactive
            />
          </div>
      </section>
    </main>
  );
}

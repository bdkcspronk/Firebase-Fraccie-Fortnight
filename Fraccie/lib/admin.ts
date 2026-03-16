import { get, ref, remove, set, update } from "firebase/database";
import { db } from "@/lib/firebase";

export const adminStartGame = async () => update(ref(db, "game"), { status: "running" });

export const adminShrinkCircle = async (delta = 50) => {
  const gameRef = ref(db, "game");
  const snap = await get(gameRef);
  const currentRadius = Number(snap.val()?.circle_radius ?? 500);
  await update(gameRef, { circle_radius: Math.max(20, currentRadius - delta) });
};

export const adminEndGame = async () => update(ref(db, "game"), { status: "finished" });

export const adminSetCircleCenter = async (lat: number, lng: number) =>
  update(ref(db, "game"), {
    circle_center_lat: lat,
    circle_center_lng: lng
  });

export const adminSetCircleRadius = async (radius: number) =>
  update(ref(db, "game"), {
    circle_radius: Math.max(20, radius)
  });

export const adminSetEnemyVisibility = async (enabled: boolean) =>
  update(ref(db, "game"), {
    enemy_visibility: enabled
  });

export const adminResetGame = async () => {
  await set(ref(db, "game"), {
    status: "waiting",
    circle_center_lat: 53.2172313,
    circle_center_lng: 6.5647853,
    circle_radius: 500,
    enemy_visibility: false,
    secret_code: "CHICKEN",
    winner_team_id: null
  });
  await remove(ref(db, "battles"));
};

export const adminOverrideBattle = async (battleId: string, winner: string | null) =>
  update(ref(db, `battles/${battleId}`), {
    winner,
    confirmed: false,
    status: winner ? "submitted" : "cancelled"
  });

export const adminDeleteTeam = async (teamId: string, joinCode?: string) => {
  const updates: Record<string, null> = {
    [`teams/${teamId}`]: null
  };

  if (joinCode) {
    updates[`teamCodes/${joinCode}`] = null;
  }

  const battlesSnap = await get(ref(db, "battles"));
  const battles = (battlesSnap.val() ?? {}) as Record<string, { team_a?: string; team_b?: string }>;
  for (const [battleId, battle] of Object.entries(battles)) {
    if (battle.team_a === teamId || battle.team_b === teamId) {
      updates[`battles/${battleId}`] = null;
    }
  }

  await update(ref(db), updates);
};

export const adminDeleteAllTeams = async () => {
  const gameSnap = await get(ref(db, "game"));
  const status = String(gameSnap.val()?.status ?? "waiting");
  if (status === "running") {
    throw new Error("Cannot delete all teams while game is running.");
  }

  const teamsSnap = await get(ref(db, "teams"));
  const teams = (teamsSnap.val() ?? {}) as Record<string, unknown>;
  const teamCount = Object.keys(teams).length;
  if (!teamCount) return 0;

  const battlesSnap = await get(ref(db, "battles"));
  const battles = (battlesSnap.val() ?? {}) as Record<string, unknown>;

  const teamCodesSnap = await get(ref(db, "teamCodes"));
  const teamCodes = (teamCodesSnap.val() ?? {}) as Record<string, unknown>;

  const updates: Record<string, null> = {};
  for (const teamId of Object.keys(teams)) {
    updates[`teams/${teamId}`] = null;
  }

  for (const battleId of Object.keys(battles)) {
    updates[`battles/${battleId}`] = null;
  }

  for (const code of Object.keys(teamCodes)) {
    updates[`teamCodes/${code}`] = null;
  }

  await update(ref(db), updates);
  // Broadcast a message to notify all clients that teams were deleted
  await update(ref(db), { 'broadcast/teamsDeleted': Date.now() });

  return teamCount;
};

export const adminPruneInactiveTeams = async (maxInactiveMs = 10 * 60_000) => {
  const gameSnap = await get(ref(db, "game"));
  const status = String(gameSnap.val()?.status ?? "waiting");
  if (status === "running") {
    throw new Error("Cannot prune teams while game is running.");
  }

  const teamsSnap = await get(ref(db, "teams"));
  const teams = (teamsSnap.val() ?? {}) as Record<string, { joinCode?: string; members?: Record<string, boolean>; memberProfiles?: Record<string, { lastSeen: number }> }>;

  const battlesSnap = await get(ref(db, "battles"));
  const battles = (battlesSnap.val() ?? {}) as Record<string, { team_a?: string; team_b?: string }>;

  const now = Date.now();
  const teamsToDelete = Object.entries(teams).filter(([, team]) => {
    const memberCount = Object.keys(team.members ?? {}).length;
    const lastSeenValues = Object.values(team.memberProfiles ?? {}).map((profile) => profile.lastSeen);
    const lastActive = lastSeenValues.length ? Math.max(...lastSeenValues) : 0;
    const inactive = now - lastActive > maxInactiveMs;
    return memberCount === 0 || inactive;
  });

  if (!teamsToDelete.length) return 0;

  const updates: Record<string, null> = {};
  const teamIds = new Set(teamsToDelete.map(([teamId]) => teamId));

  for (const [teamId, team] of teamsToDelete) {
    updates[`teams/${teamId}`] = null;
    if (team.joinCode) updates[`teamCodes/${team.joinCode}`] = null;
  }

  for (const [battleId, battle] of Object.entries(battles)) {
    if ((battle.team_a && teamIds.has(battle.team_a)) || (battle.team_b && teamIds.has(battle.team_b))) {
      updates[`battles/${battleId}`] = null;
    }
  }

  await update(ref(db), updates);
  return teamsToDelete.length;
};

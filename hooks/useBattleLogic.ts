"use client";

import { useMemo } from "react";
import { get, push, ref, runTransaction, set, update } from "firebase/database";
import { db } from "@/lib/firebase";
import { BATTLE_DISTANCE_METERS, BATTLE_TIMEOUT_MS } from "@/lib/constants";
import { Battle, Bar, Team, BattleType } from "@/lib/types";
import { distanceMeters, isWithinRadius } from "@/lib/geo";

export function useBattleLogic(
  myTeamId: string | null,
  teams: Record<string, Team>,
  bars: Record<string, Bar>,
  battles: Record<string, Battle>
) {
  const availableTeamIds = useMemo(() => {
    if (!myTeamId || !teams[myTeamId]) return [];
    const mine = teams[myTeamId];

    return Object.entries(teams)
      .filter(([teamId, t]) => {
        if (teamId === myTeamId) return false;
        const nearEnough = distanceMeters(mine.lat, mine.lng, t.lat, t.lng) <= BATTLE_DISTANCE_METERS;
        if (!nearEnough) return false;
        return Object.values(bars).some(
          (bar) =>
            isWithinRadius(bar.lat, bar.lng, bar.radius, mine.lat, mine.lng) &&
            isWithinRadius(bar.lat, bar.lng, bar.radius, t.lat, t.lng)
        );
      })
      .map(([teamId]) => teamId);
  }, [myTeamId, teams, bars]);

  const hasOpenBattle = (a: string, b: string): boolean =>
    Object.values(battles).some(
      (battle) =>
        battle.status !== "cancelled" &&
        !battle.confirmed &&
        ((battle.team_a === a && battle.team_b === b) || (battle.team_a === b && battle.team_b === a))
    );

  const startBattle = async (targetTeamId: string) => {
    if (!myTeamId || hasOpenBattle(myTeamId, targetTeamId)) return;
    const battleRef = push(ref(db, "battles"));
    await set(battleRef, {
      team_a: myTeamId,
      team_b: targetTeamId,
      type: "",
      winner: null,
      confirmed: false,
      createdAt: Date.now(),
      status: "pending"
    } satisfies Battle);
  };

  const setBattleType = async (battleId: string, type: BattleType) => {
    await update(ref(db, `battles/${battleId}`), { type });
  };

  const submitWinner = async (battleId: string, winnerTeamId: string) => {
    await update(ref(db, `battles/${battleId}`), { winner: winnerTeamId, status: "submitted" });
  };

  const confirmBattle = async (battleId: string) => {
    const battleRef = ref(db, `battles/${battleId}`);
    const snap = await get(battleRef);
    const battle = snap.val() as Battle;
    if (!battle?.winner || battle.confirmed) return;

    await runTransaction(ref(db, `teams/${battle.winner}`), (team) => {
      if (!team) return team;
      return { ...team, wins: (team.wins ?? 0) + 1 };
    });

    const loser = battle.winner === battle.team_a ? battle.team_b : battle.team_a;
    await runTransaction(ref(db, `teams/${loser}`), (team) => {
      if (!team) return team;
      return { ...team, losses: (team.losses ?? 0) + 1 };
    });

    await update(battleRef, { confirmed: true });
  };

  const autoCancelExpiredBattles = async () => {
    const now = Date.now();
    await Promise.all(
      Object.entries(battles)
        .filter(([, battle]) => !battle.confirmed && now - battle.createdAt > BATTLE_TIMEOUT_MS)
        .map(([battleId]) => update(ref(db, `battles/${battleId}`), { status: "cancelled" }))
    );
  };

  return {
    availableTeamIds,
    startBattle,
    setBattleType,
    submitWinner,
    confirmBattle,
    autoCancelExpiredBattles
  };
}

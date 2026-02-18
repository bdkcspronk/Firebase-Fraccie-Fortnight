"use client";

import { useCallback, useMemo } from "react";
import { push, ref, runTransaction, set, update } from "firebase/database";
import { db } from "@/lib/firebase";
import { BATTLE_DISTANCE_METERS, BATTLE_TIMEOUT_MS } from "@/lib/constants";
import { Battle, Bar, Team, BattleType } from "@/lib/types";
import { distanceMeters, isWithinRadius } from "@/lib/geo";

export function useBattleLogic(
  myTeamId: string | null,
  teams: Record<string, Team>,
  bars: Record<string, Bar>,
  battles: Record<string, Battle>,
  isAdmin: boolean
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
    
    // Update winner's stats immediately
    if (myTeamId === winnerTeamId) {
      await runTransaction(ref(db, `teams/${myTeamId}`), (team) => {
        if (!team) return team;
        return { ...team, wins: (team.wins ?? 0) + 1 };
      });
    }
  };

  const confirmBattle = async (battleId: string) => {
    const battleRef = ref(db, `battles/${battleId}`);
    const result = await runTransaction(battleRef, (battle) => {
      if (!battle?.winner || battle.confirmed) return;
      return { ...battle, confirmed: true };
    });
    if (!result.committed) return;

    const battle = result.snapshot.val() as Battle;
    if (!myTeamId || !battle?.winner) return;

    const isParticipant = myTeamId === battle.team_a || myTeamId === battle.team_b;
    if (!isParticipant) return;

    // Update confirming team's losses (winner already updated their wins in submitWinner)
    if (myTeamId !== battle.winner) {
      await runTransaction(ref(db, `teams/${myTeamId}`), (team) => {
        if (!team) return team;
        return { ...team, losses: (team.losses ?? 0) + 1 };
      });
    }
  };

  const autoCancelExpiredBattles = useCallback(async () => {
    // Require authentication - either as a team member or admin
    if (!myTeamId && !isAdmin) return;
    
    const now = Date.now();
    await Promise.all(
      Object.entries(battles)
        .filter(([, battle]) => 
          !battle.confirmed && 
          now - battle.createdAt > BATTLE_TIMEOUT_MS &&
          (battle.team_a === myTeamId || battle.team_b === myTeamId || isAdmin)
        )
        .map(([battleId]) => update(ref(db, `battles/${battleId}`), { status: "cancelled" }))
    );
  }, [myTeamId, isAdmin, battles]);

  return {
    availableTeamIds,
    startBattle,
    setBattleType,
    submitWinner,
    confirmBattle,
    autoCancelExpiredBattles
  };
}

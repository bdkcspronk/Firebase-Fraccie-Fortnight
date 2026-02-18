"use client";

import { useCallback, useMemo } from "react";
import { push, ref, runTransaction, set, update } from "firebase/database";
import { db } from "@/lib/firebase";
import { BATTLE_COOLDOWN_MS, BATTLE_DISTANCE_METERS, BATTLE_TIMEOUT_MS } from "@/lib/constants";
import { Battle, Bar, Team, BattleOutcome, BattleType } from "@/lib/types";
import { distanceMeters, isWithinRadius } from "@/lib/geo";

interface TeamPosition {
  lat: number;
  lng: number;
}

const pairMatches = (battle: Battle, a: string, b: string) =>
  (battle.team_a === a && battle.team_b === b) || (battle.team_a === b && battle.team_b === a);

const isFinitePosition = (lat: unknown, lng: unknown): lat is number & typeof lng extends number ? number : number =>
  typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng);

const getTeamPositions = (team: Team): TeamPosition[] => {
  const memberPositions = Object.values(team.memberLocations ?? {})
    .filter((location) => isFinitePosition(location.lat, location.lng))
    .map((location) => ({ lat: location.lat, lng: location.lng }));

  if (memberPositions.length > 0) return memberPositions;
  if (isFinitePosition(team.lat, team.lng)) return [{ lat: team.lat, lng: team.lng }];
  return [];
};

export function useBattleLogic(
  myTeamId: string | null,
  teams: Record<string, Team>,
  bars: Record<string, Bar>,
  battles: Record<string, Battle>,
  isAdmin: boolean
) {
  const hasOpenBattle = useCallback(
    (a: string, b: string): boolean =>
      Object.values(battles).some((battle) => battle.status !== "cancelled" && !battle.confirmed && pairMatches(battle, a, b)),
    [battles]
  );

  const hasCooldown = useCallback(
    (a: string, b: string): boolean => {
      const now = Date.now();
      return Object.values(battles).some(
        (battle) =>
          battle.confirmed &&
          typeof battle.resolvedAt === "number" &&
          now - battle.resolvedAt < BATTLE_COOLDOWN_MS &&
          pairMatches(battle, a, b)
      );
    },
    [battles]
  );

  const availableTeamIds = useMemo(() => {
    if (!myTeamId || !teams[myTeamId]) return [];
    const mine = teams[myTeamId];
    const myPositions = getTeamPositions(mine);
    if (myPositions.length === 0) return [];

    const activeBars = Object.values(bars).filter(
      (bar) =>
        bar.active !== false &&
        typeof bar.radius === "number" &&
        Number.isFinite(bar.radius) &&
        Number.isFinite(bar.lat) &&
        Number.isFinite(bar.lng)
    );

    return Object.entries(teams)
      .filter(([teamId, t]) => {
        if (teamId === myTeamId) return false;
        if (hasOpenBattle(myTeamId, teamId) || hasCooldown(myTeamId, teamId)) return false;
        const targetPositions = getTeamPositions(t);
        if (targetPositions.length === 0) return false;

        const nearEnough = myPositions.some((myPos) =>
          targetPositions.some((targetPos) => distanceMeters(myPos.lat, myPos.lng, targetPos.lat, targetPos.lng) <= BATTLE_DISTANCE_METERS)
        );
        if (!nearEnough) return false;

        return activeBars.some((bar) =>
          myPositions.some((myPos) => isWithinRadius(bar.lat, bar.lng, bar.radius, myPos.lat, myPos.lng)) &&
          targetPositions.some((targetPos) => isWithinRadius(bar.lat, bar.lng, bar.radius, targetPos.lat, targetPos.lng))
        );
      })
      .map(([teamId]) => teamId);
  }, [myTeamId, teams, bars, hasOpenBattle, hasCooldown]);

  const startBattle = async (targetTeamId: string) => {
    if (!myTeamId || hasOpenBattle(myTeamId, targetTeamId) || hasCooldown(myTeamId, targetTeamId)) return;
    const battleRef = push(ref(db, "battles"));
    await set(battleRef, {
      team_a: myTeamId,
      team_b: targetTeamId,
      type: "",
      winner: null,
      confirmed: false,
      createdAt: Date.now(),
      scoreApplied: false,
      status: "pending"
    } satisfies Battle);
  };

  const setBattleType = async (battleId: string, type: BattleType) => {
    await update(ref(db, `battles/${battleId}`), { type });
  };

  const submitOutcome = async (battleId: string, outcome: BattleOutcome) => {
    if (!myTeamId) return;
    const battleRef = ref(db, `battles/${battleId}`);

    const result = await runTransaction(battleRef, (battle) => {
      if (!battle || typeof battle !== "object") return battle;
      if (battle.status === "cancelled" || battle.confirmed) return battle;
      if (battle.team_a !== myTeamId && battle.team_b !== myTeamId) return battle;

      const nextBattle = { ...battle } as Battle;
      if (battle.team_a === myTeamId) nextBattle.outcome_a = outcome;
      if (battle.team_b === myTeamId) nextBattle.outcome_b = outcome;

      const outcomeA = nextBattle.outcome_a;
      const outcomeB = nextBattle.outcome_b;

      if (outcomeA && outcomeB) {
        if (outcomeA === outcomeB) {
          nextBattle.winner = null;
          nextBattle.status = "disputed";
          nextBattle.confirmed = false;
          nextBattle.resolvedAt = undefined;
        } else {
          nextBattle.winner = outcomeA === "win" ? nextBattle.team_a : nextBattle.team_b;
          nextBattle.status = "resolved";
          nextBattle.confirmed = true;
          nextBattle.resolvedAt = Date.now();
          if (typeof nextBattle.scoreApplied !== "boolean") nextBattle.scoreApplied = false;
        }
      } else {
        nextBattle.status = "submitted";
      }

      return nextBattle;
    });
    if (!result.committed) return;

    const battle = result.snapshot.val() as Battle;
    if (!battle?.confirmed || !battle.winner) return;

    const markScoreApplied = await runTransaction(battleRef, (currentBattle) => {
      if (!currentBattle || typeof currentBattle !== "object") return currentBattle;
      if (!currentBattle.confirmed || !currentBattle.winner || currentBattle.scoreApplied) return currentBattle;
      return { ...currentBattle, scoreApplied: true };
    });
    if (!markScoreApplied.committed) return;

    const winnerTeamId = battle.winner;
    const loserTeamId = winnerTeamId === battle.team_a ? battle.team_b : battle.team_a;

    await runTransaction(ref(db, `teams/${winnerTeamId}`), (team) => {
      if (!team) return team;
      return { ...team, wins: (team.wins ?? 0) + 1 };
    });

    if (loserTeamId) {
      await runTransaction(ref(db, `teams/${loserTeamId}`), (team) => {
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
    submitOutcome,
    autoCancelExpiredBattles
  };
}

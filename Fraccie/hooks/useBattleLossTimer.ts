import { useEffect, useState } from "react";
import { Battle } from "@/lib/types";

export function useBattleLossTimer(battles: Record<string, Battle>, teamId: string): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    // Find the most recent lost battle
    if (!teamId || !battles || typeof battles !== "object") {
      setRemaining(null);
      console.log("[LossTimer] No teamId or battles");
      return;
    }
    const now = Date.now();
    const lostBattle = Object.values(battles)
      .filter(b =>
        b &&
        (b.team_a === teamId || b.team_b === teamId) &&
        b.status === "resolved" &&
        b.confirmed &&
        typeof b.resolvedAt === "number" &&
        typeof b.winner === "string" &&
        b.winner !== teamId
      )
      .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0))[0];

    console.log("[LossTimer] lostBattle:", lostBattle);

    if (!lostBattle) {
      setRemaining(null);
      console.log("[LossTimer] No lost battle found");
      return;
    }

    const duration = 2 * 60 * 1000; // 2 minutes
    const getTimeLeft = () => {
      if (typeof lostBattle.resolvedAt !== "number") return 0;
      return duration - (Date.now() - lostBattle.resolvedAt);
    };

    const update = () => {
      const timeLeft = getTimeLeft();
      setRemaining(timeLeft > 0 ? timeLeft : null);
      console.log("[LossTimer] timeLeft:", timeLeft);
    };

    update();
    const interval = setInterval(update, 1000);

    return () => clearInterval(interval);
  }, [battles, teamId]);

  return remaining;
}
"use client";

import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { db } from "@/lib/firebase";
import { Game } from "@/lib/types";

const defaultGame: Game = {
  status: "waiting",
  circle_center_lat: 0,
  circle_center_lng: 0,
  circle_radius: 500,
  secret_code: "CHICKEN",
  winner_team_id: null
};

export function useGameState() {
  const [game, setGame] = useState<Game>(defaultGame);

  useEffect(() => {
    return onValue(ref(db, "game"), (snapshot) => {
      if (snapshot.exists()) setGame(snapshot.val() as Game);
    });
  }, []);

  return game;
}

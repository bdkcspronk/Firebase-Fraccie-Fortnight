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

export const adminResetGame = async () => {
  await set(ref(db, "game"), {
    status: "waiting",
    circle_center_lat: 0,
    circle_center_lng: 0,
    circle_radius: 500,
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

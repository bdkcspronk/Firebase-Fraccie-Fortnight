export type GameStatus = "waiting" | "running" | "finished";

export interface Team {
  name: string;
  color: string;
  lat: number;
  lng: number;
  wins: number;
  losses: number;
  lastUpdate: number;
}

export interface Game {
  status: GameStatus;
  circle_center_lat: number;
  circle_center_lng: number;
  circle_radius: number;
  secret_code: string;
  winner_team_id: string | null;
}

export type BattleType = "chug" | "challenge";

export interface Battle {
  team_a: string;
  team_b: string;
  type: BattleType | "";
  winner: string | null;
  confirmed: boolean;
  createdAt: number;
  status: "pending" | "submitted" | "cancelled";
}

export interface Bar {
  name: string;
  lat: number;
  lng: number;
  radius: number;
}

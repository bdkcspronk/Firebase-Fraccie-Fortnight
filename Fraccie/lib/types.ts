export type GameStatus = "waiting" | "running" | "finished";

export interface TeamMemberProfile {
  name: string;
  lastSeen: number;
}

export interface TeamMemberLocation {
  lat: number;
  lng: number;
  lastUpdate: number;
}

export interface Team {
  name: string;
  color: string;
  lat: number;
  lng: number;
  wins: number;
  losses: number;
  lastUpdate: number;
  joinCode?: string;
  members?: Record<string, boolean>;
  memberProfiles?: Record<string, TeamMemberProfile>;
  memberLocations?: Record<string, TeamMemberLocation>;
}

export interface Game {
  status: GameStatus;
  circle_center_lat: number;
  circle_center_lng: number;
  circle_radius: number;
  enemy_visibility?: boolean;
  secret_code: string;
  winner_team_id: string | null;
}

export type BattleType = "chug" | "challenge";
export type BattleOutcome = "win" | "lose";

export interface Battle {
  team_a: string;
  team_b: string;
  type: BattleType | "";
  winner: string | null;
  confirmed: boolean;
  createdAt: number;
  resolvedAt?: number;
  scoreApplied?: boolean;
  outcome_a?: BattleOutcome;
  outcome_b?: BattleOutcome;
  status: "pending" | "submitted" | "disputed" | "resolved" | "cancelled";
}

export interface Bar {
  name: string;
  lat: number;
  lng: number;
  radius: number;
  active?: boolean;
  clearedAt?: number;
  clearedBy?: string;
}

import React, { useState } from "react";
import { Team } from "@/lib/types";

// Utility to darken a hex color
function darkenColor(hex: string, amount = 0.25) {
  if (!hex.startsWith('#')) return hex;
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  r = Math.floor(r * (1 - amount));
  g = Math.floor(g * (1 - amount));
  b = Math.floor(b * (1 - amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Utility to clamp color brightness
function clampColorBrightness(hex: string, amount = 0.8) {
  if (!hex.startsWith('#')) return hex;
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  r = Math.floor(r * amount);
  g = Math.floor(g * amount);
  b = Math.floor(b * amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

interface TeamRankingProps {
  teams: Record<string, Team>;
  currentTeamId: string;
  showRankingDefault?: boolean;
}

export const TeamRanking: React.FC<TeamRankingProps> = ({ teams, currentTeamId, showRankingDefault = true }) => {
  const [showRanking, setShowRanking] = useState(showRankingDefault);

  // Use clamped color for UI backgrounds (same as main UI)
  const team = teams[currentTeamId];
  const teamBgColor = team?.color ? darkenColor(clampColorBrightness(team.color, 0.8), 0.25) : 'var(--color-background)';

  // Sort teams by wins desc, then losses asc, then name
  const sortedTeams = Object.entries(teams)
    .map(([id, team]) => ({
      id,
      name: team.name || `Team-${id.slice(0, 4)}`,
      wins: Number.isFinite(team.wins) ? team.wins : 0,
      losses: Number.isFinite(team.losses) ? team.losses : 0,
      color: team.color || undefined,
    }))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      return a.name.localeCompare(b.name);
    });

  if (!showRanking) {
    return (
      <div className="w-full px-4 py-2 text-center cursor-pointer select-none" onClick={() => setShowRanking(true)}>
        <span className="text-xs text-slate-300">Show team ranking</span>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-2 rounded-b-xl shadow cursor-pointer select-none" style={{ background: teamBgColor }} onClick={() => setShowRanking(false)}>
      <div className="mb-1 text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>Team Ranking</div>
      <ul className="space-y-1">
        {sortedTeams.map((team, idx) => (
          <li
            key={team.id}
            className={`flex items-center justify-between px-2 py-1 rounded text-xs font-bold`}
            style={{
              background: team.color ? darkenColor(team.color, 0.15) : 'var(--color-slate)',
              color: team.id === currentTeamId ? 'var(--color-text-primary)' : 'var(--color-text-primary)',
              borderLeft: team.color ? `4px solid ${team.color}` : undefined,
            }}
          >
            <span>
              #{idx + 1} {team.name}
            </span>
            <span>
              {team.wins}W / {team.losses}L
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-1 text-xs text-center" style={{ color: 'var(--color-text-primary)' }}>Tap to hide</div>
    </div>
  );
};

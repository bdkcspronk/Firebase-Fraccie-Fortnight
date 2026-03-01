"use client";
import { motion, AnimatePresence } from "framer-motion";
import React from "react";

interface ChallengeButtonsClientProps {
  availableTeamIds: string[];
  teams: any;
  onChallenge: (id: string) => void;
}

export function ChallengeButtonsClient({ availableTeamIds, teams, onChallenge }: ChallengeButtonsClientProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
      <div className="flex gap-2 w-2/3 max-w-xl px-4 pointer-events-auto">
        <AnimatePresence>
          {availableTeamIds.slice(0, 3).map((id) => (
            <motion.button
              key={id}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.7, opacity: 0 }}
              transition={{ duration: 0.4, type: "spring", bounce: 0.4 }}
              className="rounded px-5 py-7 w-full font-bold border border-slate-700 p-2 text-xl"
              style={{ backgroundColor: teams[id]?.color || 'var(--color-primary)', color: 'var(--color-text-primary)' }}
              onClick={() => onChallenge(id)}
            >
              <span className="block text-lg font-bold">CHALLENGE</span>
              <span className="block text-2xl font-extrabold mt-2">{teams[id]?.name ?? id.slice(0, 4)}</span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

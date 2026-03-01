import React from "react";

interface LossTimerOverlayProps {
  ms: number;
}

export const LossTimerOverlay: React.FC<LossTimerOverlayProps> = ({ ms }) => {
  if (ms === null || ms <= 0) return null;
  return (
    <div className="absolute left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 bg-black/80 rounded-xl px-8 py-6 text-center shadow-xl border border-slate-700" style={{ minWidth: 220 }}>
      <div className="text-3xl font-bold text-white">Continue in</div>
      <div className="mt-2 text-5xl font-extrabold text-white tracking-widest">
        {Math.floor(ms / 60000)}:{String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}
      </div>
    </div>
  );
};

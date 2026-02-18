"use client";

import { useEffect, useMemo, useState } from "react";
import { get, onValue, ref, set } from "firebase/database";
import { auth, db, ensureAnonymousAuth } from "@/lib/firebase";
import { TEAM_ID_STORAGE_KEY } from "@/lib/constants";
import { Team } from "@/lib/types";

const randomColor = (): string => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;

const teamFactory = (name: string): Team => ({
  name,
  color: randomColor(),
  lat: 0,
  lng: 0,
  wins: 0,
  losses: 0,
  lastUpdate: Date.now()
});

export function useAuthTeam() {
  const [uid, setUid] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let unsubscribeTeam = () => undefined;

    const init = async () => {
      const nextUid = await ensureAnonymousAuth();
      setUid(nextUid);

      const adminSnap = await get(ref(db, `admins/${nextUid}`));
      setIsAdmin(Boolean(adminSnap.val()));

      // Team ownership follows the authenticated anonymous uid so team writes are always allowed by rules.
      // We still persist to localStorage for quick client boot + compatibility with existing data.
      const storedTeamId = localStorage.getItem(TEAM_ID_STORAGE_KEY);
      const resolvedTeamId = storedTeamId === nextUid ? storedTeamId : nextUid;
      localStorage.setItem(TEAM_ID_STORAGE_KEY, resolvedTeamId);
      setTeamId(resolvedTeamId);

      const teamRef = ref(db, `teams/${resolvedTeamId}`);
      const teamSnap = await get(teamRef);
      if (!teamSnap.exists()) {
        const defaultName = `Team-${resolvedTeamId.slice(0, 6)}`;
        await set(teamRef, teamFactory(defaultName));
      }

      unsubscribeTeam = onValue(teamRef, (snapshot) => {
        setTeam(snapshot.val() as Team);
        setLoading(false);
      });
    };

    void init();

    return () => unsubscribeTeam();
  }, []);

  return useMemo(
    () => ({ uid, teamId, team, loading, isAdmin, currentAuthUid: auth.currentUser?.uid ?? null }),
    [uid, teamId, team, loading, isAdmin]
  );
}

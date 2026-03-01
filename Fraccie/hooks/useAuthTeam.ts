"use client";

import { useEffect, useMemo, useState } from "react";
import { get, onValue, push, ref, runTransaction, set, update } from "firebase/database";
import { auth, db, ensureAnonymousAuth } from "@/lib/firebase";
import { PLAYER_NAME_STORAGE_KEY, TEAM_ID_STORAGE_KEY } from "@/lib/constants";
import { Team } from "@/lib/types";
import { getRandomWord } from "@/lib/words";

const randomColor = (): string => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;

const teamFactory = (name: string, uid: string, playerName: string): Team => {
  return {
    name,
    color: randomColor(),
    lat: 0,
    lng: 0,
    wins: 0,
    losses: 0,
    lastUpdate: Date.now(),
    members: {
      [uid]: true
    },
    memberProfiles: {
      [uid]: {
        name: playerName,
        lastSeen: Date.now()
      }
    }
  };
};

async function ensurePersonalTeam(uid: string) {
  const fallbackName = `Player-${uid.slice(0, 4)}`;
  const personalRef = ref(db, `teams/${uid}`);
  const personalSnap = await get(personalRef);
  const storedPlayerName = localStorage.getItem(PLAYER_NAME_STORAGE_KEY)?.trim() || fallbackName;
  if (!personalSnap.exists()) {
    const randomName = getRandomWord();
    await set(personalRef, teamFactory(randomName, uid, storedPlayerName));
  } else {
    await set(ref(db, `teams/${uid}/members/${uid}`), true);
    await set(ref(db, `teams/${uid}/memberProfiles/${uid}`), {
      name: storedPlayerName,
      lastSeen: Date.now()
    });
  }
  return uid;
}

async function cleanupTeamIfEmpty(teamId: string) {
  const teamSnap = await get(ref(db, `teams/${teamId}`));
  const team = teamSnap.val() as Team | null;
  if (!team) return;

  const members = Object.keys(team.members ?? {});
  if (members.length > 0) return;

  const updates: Record<string, null> = {
    [`teams/${teamId}`]: null
  };

  await update(ref(db), updates);
}

type UseAuthTeamOptions = {
  bootstrapTeam?: boolean;
};

export function useAuthTeam(options?: UseAuthTeamOptions) {
  const bootstrapTeam = options?.bootstrapTeam ?? true;
  const [uid, setUid] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [teamActionPending, setTeamActionPending] = useState(false);
  const [teamActionError, setTeamActionError] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("");

  useEffect(() => {
    const init = async () => {
      try {
        const nextUid = await ensureAnonymousAuth();
        setUid(nextUid);

        const fallbackName = `Player-${nextUid.slice(0, 4)}`;
        const storedPlayerName = localStorage.getItem(PLAYER_NAME_STORAGE_KEY)?.trim() || fallbackName;
        localStorage.setItem(PLAYER_NAME_STORAGE_KEY, storedPlayerName);
        setPlayerName(storedPlayerName);

        const adminSnap = await get(ref(db, `admins/${nextUid}`));
        setIsAdmin(Boolean(adminSnap.val()));

        if (!bootstrapTeam) {
          setTeamId(null);
          setTeam(null);
          setLoading(false);
          return;
        }

        const storedTeamId = localStorage.getItem(TEAM_ID_STORAGE_KEY);
        let resolvedTeamId = storedTeamId ?? nextUid;

        if (resolvedTeamId !== nextUid) {
          const selectedTeamSnap = await get(ref(db, `teams/${resolvedTeamId}`));
          if (!selectedTeamSnap.exists()) {
            resolvedTeamId = nextUid;
          } else {
            try {
              await set(ref(db, `teams/${resolvedTeamId}/members/${nextUid}`), true);
            } catch {
              resolvedTeamId = nextUid;
            }
          }
        }

        if (resolvedTeamId === nextUid) {
          await ensurePersonalTeam(nextUid);
        }

        await set(ref(db, `teams/${resolvedTeamId}/memberProfiles/${nextUid}`), {
          name: storedPlayerName,
          lastSeen: Date.now()
        });

        localStorage.setItem(TEAM_ID_STORAGE_KEY, resolvedTeamId);
        setTeamId(resolvedTeamId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to initialize auth or team.";
        setAuthError(message);
        setLoading(false);
      }
    };

    void init();
  }, [bootstrapTeam]);

  useEffect(() => {
    if (!teamId) return;

    let unsubscribeTeam: (() => void) | null = null;

    const subscribe = async () => {
      try {
        unsubscribeTeam = onValue(
          ref(db, `teams/${teamId}`),
          (snapshot) => {
            setTeam((snapshot.val() as Team | null) ?? null);
            setLoading(false);
          },
          (error) => {
            setAuthError(error.message);
            setLoading(false);
          }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to initialize auth or team.";
        setAuthError(message);
        setLoading(false);
      }
    };

    void subscribe();

    return () => {
      unsubscribeTeam?.();
    };
  }, [teamId]);

  useEffect(() => {
    if (!uid || !teamId || !playerName) return;

    const writeHeartbeat = async () => {
      await set(ref(db, `teams/${teamId}/memberProfiles/${uid}`), {
        name: playerName,
        lastSeen: Date.now()
      });
    };

    void writeHeartbeat();
    const intervalId = window.setInterval(() => {
      void writeHeartbeat();
    }, 15_000);

    return () => window.clearInterval(intervalId);
  }, [uid, teamId, playerName]);

  const createTeam = async () => {
    if (!uid) return;

    setTeamActionPending(true);
    setTeamActionError(null);

    try {
      const createdRef = push(ref(db, "teams"));
      if (!createdRef.key) throw new Error("Could not create a team id.");

      const createdTeamId = createdRef.key;
      const randomName = getRandomWord();

      await set(createdRef, teamFactory(randomName, uid, playerName || `Player-${uid.slice(0, 4)}`));

      localStorage.setItem(TEAM_ID_STORAGE_KEY, createdTeamId);
      setTeamId(createdTeamId);
      setLoading(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create team.";
      setTeamActionError(message);
    } finally {
      setTeamActionPending(false);
    }
  };

  const switchTeam = async (targetTeamId: string) => {
    if (!uid) return;

    const previousTeamId = teamId ?? localStorage.getItem(TEAM_ID_STORAGE_KEY);
    if (previousTeamId && previousTeamId !== targetTeamId) {
      await update(ref(db), {
        [`teams/${previousTeamId}/members/${uid}`]: null,
        [`teams/${previousTeamId}/memberProfiles/${uid}`]: null
      });
      await cleanupTeamIfEmpty(previousTeamId);
    }

    localStorage.setItem(TEAM_ID_STORAGE_KEY, targetTeamId);
    setTeamId(targetTeamId);
    setLoading(true);
  };

  const createTeamWithCleanup = async () => {
    if (!uid) return;

    setTeamActionPending(true);
    setTeamActionError(null);

    try {
      const createdRef = push(ref(db, "teams"));
      if (!createdRef.key) throw new Error("Could not create a team id.");

      const createdTeamId = createdRef.key;
      const randomName = getRandomWord();

      await set(createdRef, teamFactory(randomName, uid, playerName || `Player-${uid.slice(0, 4)}`));
      await switchTeam(createdTeamId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create team.";
      setTeamActionError(message);
    } finally {
      setTeamActionPending(false);
    }
  };

  const updatePlayerName = async (rawName: string) => {
    if (!uid || !teamId) return;

    const trimmed = rawName.trim();
    const safeName = trimmed || `Player-${uid.slice(0, 4)}`;
    setPlayerName(safeName);
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, safeName);

    await set(ref(db, `teams/${teamId}/memberProfiles/${uid}`), {
      name: safeName,
      lastSeen: Date.now()
    });
  };

  const updateTeamName = async (rawName: string) => {
    if (!teamId) return;

    const trimmed = rawName.trim();
    if (!trimmed) return;

    await update(ref(db, `teams/${teamId}`), {
      name: trimmed
    });
  };

  // Add joinTeamByName function
  const joinTeamByName = async (rawName: string) => {
    if (!uid) return;
    const name = rawName.trim();
    if (!name) {
      setTeamActionError("Enter a team name.");
      return;
    }
    setTeamActionPending(true);
    setTeamActionError(null);
    try {
      // Find team by name
      const teamsSnap = await get(ref(db, "teams"));
      const teams = teamsSnap.val() || {};
      let targetTeamId: string | null = null;
      for (const [tid, tval] of Object.entries(teams)) {
        if (typeof tval === "object" && tval !== null && "name" in tval && typeof (tval as any).name === "string" && (tval as any).name === name) {
          targetTeamId = tid;
          break;
        }
      }
      if (!targetTeamId) throw new Error("Team not found.");

      // Leave old team
      const previousTeamId = teamId ?? localStorage.getItem(TEAM_ID_STORAGE_KEY);
      if (previousTeamId && previousTeamId !== targetTeamId) {
        await update(ref(db), {
          [`teams/${previousTeamId}/members/${uid}`]: null,
          [`teams/${previousTeamId}/memberProfiles/${uid}`]: null
        });
        await cleanupTeamIfEmpty(previousTeamId);
      }

      await set(ref(db, `teams/${targetTeamId}/members/${uid}`), true);
      await set(ref(db, `teams/${targetTeamId}/memberProfiles/${uid}`), {
        name: playerName || `Player-${uid.slice(0, 4)}`,
        lastSeen: Date.now()
      });
      localStorage.setItem(TEAM_ID_STORAGE_KEY, targetTeamId);
      setTeamId(targetTeamId);
      setLoading(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to join team.";
      setTeamActionError(message);
    } finally {
      setTeamActionPending(false);
    }
  };

  return useMemo(
    () => ({
      uid,
      teamId,
      team,
      loading,
      isAdmin,
      authError,
      teamActionPending,
      teamActionError,
      playerName,
      createTeam: createTeamWithCleanup,
      joinTeamByName,
      updatePlayerName,
      updateTeamName,
      currentAuthUid: auth.currentUser?.uid ?? null
    }),
    [uid, teamId, team, loading, isAdmin, authError, teamActionPending, teamActionError, playerName]
  );
}

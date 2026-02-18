"use client";

import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { db } from "@/lib/firebase";

export function useRealtimeCollection<T>(path: string, enabled = true) {
  const [items, setItems] = useState<Record<string, T>>({});

  useEffect(() => {
    if (!enabled) {
      setItems({});
      return;
    }

    return onValue(ref(db, path), (snapshot) => {
      const raw = snapshot.val();
      if (!raw || typeof raw !== "object") {
        setItems({});
        return;
      }

      const sanitized = Object.entries(raw as Record<string, unknown>).reduce<Record<string, T>>((acc, [key, value]) => {
        if (value && typeof value === "object") {
          acc[key] = value as T;
        }
        return acc;
      }, {});

      setItems(sanitized);
    });
  }, [path, enabled]);

  return items;
}

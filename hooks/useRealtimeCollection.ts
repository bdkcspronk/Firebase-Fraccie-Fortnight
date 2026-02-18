"use client";

import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { db } from "@/lib/firebase";

export function useRealtimeCollection<T>(path: string) {
  const [items, setItems] = useState<Record<string, T>>({});

  useEffect(() => {
    return onValue(ref(db, path), (snapshot) => {
      setItems((snapshot.val() ?? {}) as Record<string, T>);
    });
  }, [path]);

  return items;
}

'use client';
// Tiny localStorage-backed useState. Used for filter / sort / view-mode
// preferences that should survive a reload but are too small to bother
// the database with.
//
// Scoped per user when a userId is provided so a shared device doesn't
// leak preferences between accounts. Falls back to a plain useState if
// the browser doesn't expose localStorage (Private Browsing, SSR).

import { useEffect, useRef, useState } from 'react';

export function useStoredState<T>(
  key: string,
  initial: T,
  userId: string | null | undefined
): [T, (value: T | ((prev: T) => T)) => void] {
  const fullKey = `hk:pref:${userId || 'anon'}:${key}`;
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);

  // Hydrate from localStorage on mount (and when userId changes,
  // which means the active account switched).
  useEffect(() => {
    loaded.current = false;
    try {
      if (typeof window === 'undefined') return;
      const raw = window.localStorage.getItem(fullKey);
      if (raw !== null) {
        try {
          setValue(JSON.parse(raw) as T);
        } catch {
          /* ignore corrupt entry */
        }
      } else {
        setValue(initial);
      }
    } finally {
      loaded.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  // Mirror writes back. We skip the very first render so a `setValue`
  // called from inside another effect doesn't fight the hydration.
  useEffect(() => {
    if (!loaded.current) return;
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(fullKey, JSON.stringify(value));
    } catch {
      /* localStorage may be disabled — UI still works in-memory */
    }
  }, [fullKey, value]);

  return [value, setValue];
}

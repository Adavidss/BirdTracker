"use client";

// Global "where am I birding" state. null = the baked home area (config.json);
// any other place = live eBird lookups through the Worker. Persisted in
// localStorage so the whole app reopens where you left off.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { liveEnabled, readArea, writeArea, type LiveArea } from "./live";

interface AreaState {
  /** null = home area (baked JSON). */
  area: LiveArea | null;
  setArea: (a: LiveArea | null) => void;
  /** False until the saved choice has been restored (first client render) —
   *  pages should hold their fetches until this is true to avoid a home-data
   *  flash when a live area was saved. */
  ready: boolean;
}

const Ctx = createContext<AreaState>({ area: null, setArea: () => {}, ready: false });

export function AreaProvider({ children }: { children: React.ReactNode }) {
  const [area, setAreaState] = useState<LiveArea | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (liveEnabled()) setAreaState(readArea());
    setReady(true);
  }, []);

  const setArea = useCallback((a: LiveArea | null) => {
    setAreaState(a);
    writeArea(a);
  }, []);

  const value = useMemo(() => ({ area, setArea, ready }), [area, setArea, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useArea(): AreaState {
  return useContext(Ctx);
}

"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { SaveState } from "@/components/ui";

interface SaveContextValue {
  state: SaveState;
  report: (state: SaveState) => void;
}

const SaveContext = createContext<SaveContextValue | null>(null);

/**
 * One save indicator for the whole app.
 *
 * Every editor — standup fields today, issue descriptions later — reports into this, so
 * the badge lives in the global bar instead of each view growing its own.
 */
export function SaveProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SaveState>("idle");
  const value = useMemo(() => ({ state, report: setState }), [state]);
  return <SaveContext.Provider value={value}>{children}</SaveContext.Provider>;
}

export function useSaveState(): SaveState {
  return useContext(SaveContext)?.state ?? "idle";
}

/** Stable, so an editor can report from an effect without re-running it. */
export function useReportSave(): (state: SaveState) => void {
  const ctx = useContext(SaveContext);
  return ctx?.report ?? noop;
}

const noop = () => {};

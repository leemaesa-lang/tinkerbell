import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  REGION_SELECTION_CHANGED_EVENT,
  REGION_SELECTION_STORAGE_KEY,
  createRegionSelection,
  readRegionSelection,
  saveRegionSelection,
  type RegionSelection,
} from "@/lib/region-storage";

export type RegionContextValue = {
  selection: RegionSelection;
  setRegionCodes: (codes: string[]) => void;
};

const RegionContext = createContext<RegionContextValue | undefined>(undefined);

function initialSelection(): RegionSelection {
  if (typeof window === "undefined") return createRegionSelection([]);
  try {
    return readRegionSelection(window.localStorage);
  } catch {
    return createRegionSelection([]);
  }
}

export function RegionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<RegionSelection>(initialSelection);

  const setRegionCodes = useCallback((codes: string[]) => {
    const next = typeof window === "undefined" ? createRegionSelection(codes) : saveRegionSelection(codes, window.localStorage);
    setSelection(next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(REGION_SELECTION_CHANGED_EVENT, { detail: next }));
    }
  }, []);

  useEffect(() => {
    const syncFromStorage = (event: StorageEvent) => {
      if (event.key !== REGION_SELECTION_STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as { codes?: unknown };
        setSelection(createRegionSelection(parsed.codes));
      } catch {
        setSelection(readRegionSelection(window.localStorage));
      }
    };
    window.addEventListener("storage", syncFromStorage);
    return () => window.removeEventListener("storage", syncFromStorage);
  }, []);

  const value = useMemo(() => ({ selection, setRegionCodes }), [selection, setRegionCodes]);
  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

export function useRegionSelection(): RegionContextValue {
  const context = useContext(RegionContext);
  if (!context) throw new Error("useRegionSelection must be used within RegionProvider");
  return context;
}

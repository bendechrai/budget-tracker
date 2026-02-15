"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { logError } from "@/lib/logging";

interface SuggestionsCountContextValue {
  count: number;
  decrement: () => void;
  refresh: () => Promise<void>;
}

const SuggestionsCountContext = createContext<SuggestionsCountContextValue>({
  count: 0,
  decrement: () => {},
  refresh: async () => {},
});

export function SuggestionsCountProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/suggestions");
      if (!res.ok) return;
      const data = (await res.json()) as { count: number };
      setCount(data.count);
    } catch (err) {
      logError("failed to fetch suggestions count", err);
    }
  }, []);

  const decrement = useCallback(() => {
    setCount((prev) => Math.max(0, prev - 1));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ count, decrement, refresh }),
    [count, decrement, refresh]
  );

  return (
    <SuggestionsCountContext.Provider value={value}>
      {children}
    </SuggestionsCountContext.Provider>
  );
}

export function useSuggestionsCount(): SuggestionsCountContextValue {
  return useContext(SuggestionsCountContext);
}

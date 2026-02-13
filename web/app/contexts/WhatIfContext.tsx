"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import type { ObligationType, IncomeFrequency } from "@/app/generated/prisma/client";

export interface HypotheticalObligation {
  id: string;
  name: string;
  type: ObligationType;
  amount: number;
  frequency: IncomeFrequency | null;
  frequencyDays: number | null;
  nextDueDate: Date;
  endDate: Date | null;
  fundGroupId: string | null;
}

export interface WhatIfOverrides {
  toggledOffIds: Set<string>;
  amountOverrides: Map<string, number>;
  hypotheticals: HypotheticalObligation[];
}

interface WhatIfContextValue {
  overrides: WhatIfOverrides;
  isActive: boolean;
  toggleObligation: (id: string) => void;
  overrideAmount: (id: string, amount: number) => void;
  addHypothetical: (obligation: HypotheticalObligation) => void;
  removeHypothetical: (id: string) => void;
  resetAll: () => void;
  changeSummary: string;
}

function createEmptyOverrides(): WhatIfOverrides {
  return {
    toggledOffIds: new Set<string>(),
    amountOverrides: new Map<string, number>(),
    hypotheticals: [],
  };
}

const WhatIfContext = createContext<WhatIfContextValue | null>(null);

export function WhatIfProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<WhatIfOverrides>(createEmptyOverrides);

  const isActive = useMemo(() => {
    return (
      overrides.toggledOffIds.size > 0 ||
      overrides.amountOverrides.size > 0 ||
      overrides.hypotheticals.length > 0
    );
  }, [overrides]);

  const toggleObligation = useCallback((id: string) => {
    setOverrides((prev) => {
      const next = new Set(prev.toggledOffIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return {
        ...prev,
        toggledOffIds: next,
      };
    });
  }, []);

  const overrideAmount = useCallback((id: string, amount: number) => {
    setOverrides((prev) => {
      const next = new Map(prev.amountOverrides);
      next.set(id, amount);
      return {
        ...prev,
        amountOverrides: next,
      };
    });
  }, []);

  const addHypothetical = useCallback((obligation: HypotheticalObligation) => {
    setOverrides((prev) => ({
      ...prev,
      hypotheticals: [...prev.hypotheticals, obligation],
    }));
  }, []);

  const removeHypothetical = useCallback((id: string) => {
    setOverrides((prev) => ({
      ...prev,
      hypotheticals: prev.hypotheticals.filter((h) => h.id !== id),
    }));
  }, []);

  const resetAll = useCallback(() => {
    setOverrides(createEmptyOverrides());
  }, []);

  const changeSummary = useMemo(() => {
    const parts: string[] = [];
    const toggledCount = overrides.toggledOffIds.size;
    const amountCount = overrides.amountOverrides.size;
    const hypotheticalCount = overrides.hypotheticals.length;

    if (toggledCount > 0) {
      parts.push(
        `${toggledCount} expense${toggledCount === 1 ? "" : "s"} toggled off`
      );
    }
    if (amountCount > 0) {
      parts.push(
        `${amountCount} amount${amountCount === 1 ? "" : "s"} changed`
      );
    }
    if (hypotheticalCount > 0) {
      parts.push(
        `${hypotheticalCount} hypothetical${hypotheticalCount === 1 ? "" : "s"} added`
      );
    }

    return parts.join(", ");
  }, [overrides]);

  const value = useMemo<WhatIfContextValue>(
    () => ({
      overrides,
      isActive,
      toggleObligation,
      overrideAmount,
      addHypothetical,
      removeHypothetical,
      resetAll,
      changeSummary,
    }),
    [
      overrides,
      isActive,
      toggleObligation,
      overrideAmount,
      addHypothetical,
      removeHypothetical,
      resetAll,
      changeSummary,
    ]
  );

  return (
    <WhatIfContext.Provider value={value}>{children}</WhatIfContext.Provider>
  );
}

export function useWhatIf(): WhatIfContextValue {
  const context = useContext(WhatIfContext);
  if (!context) {
    throw new Error("useWhatIf must be used within a WhatIfProvider");
  }
  return context;
}

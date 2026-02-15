"use client";

import { type ReactNode } from "react";
import { WhatIfProvider } from "@/app/contexts/WhatIfContext";
import { SuggestionsCountProvider } from "@/app/contexts/SuggestionsCountContext";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SuggestionsCountProvider>
      <WhatIfProvider>{children}</WhatIfProvider>
    </SuggestionsCountProvider>
  );
}

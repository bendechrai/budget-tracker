"use client";

import { type ReactNode } from "react";
import { WhatIfProvider } from "@/app/contexts/WhatIfContext";

export default function Providers({ children }: { children: ReactNode }) {
  return <WhatIfProvider>{children}</WhatIfProvider>;
}

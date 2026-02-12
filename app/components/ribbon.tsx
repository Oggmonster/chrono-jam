import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

export function Ribbon({
  children,
  tone = "warm",
}: {
  children: ReactNode;
  tone?: "warm" | "cool";
}) {
  return (
    <h1
      className={cn(
        "mx-auto w-fit max-w-full rounded-2xl border-4 px-5 py-2 text-center font-[var(--font-display)] text-[clamp(1.5rem,4vw,2.3rem)] uppercase tracking-wide text-[#ffeaa7] shadow-[0_8px_0_#5f194e]",
        tone === "warm"
          ? "border-[#5f194e] bg-[linear-gradient(180deg,#f05f54,#cf3446)]"
          : "border-[#23267a] bg-[linear-gradient(180deg,#4f6bf5,#3b3dbd)] shadow-[0_8px_0_#23267a]",
      )}
    >
      {children}
    </h1>
  );
}

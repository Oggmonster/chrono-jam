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
        "mx-auto w-fit max-w-full rounded-full px-4 py-1 text-center text-xs font-bold uppercase tracking-wide",
        tone === "warm"
          ? "bg-[hsl(45_95%_52%)] text-[hsl(var(--foreground))]"
          : "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]",
      )}
    >
      {children}
    </h1>
  );
}

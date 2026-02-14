import * as React from "react";

import { cn } from "~/lib/utils";

type ProgressProps = React.ComponentProps<"div"> & {
  value?: number;
};

function Progress({ className, value = 0, ...props }: ProgressProps) {
  const safe = Math.max(0, Math.min(100, value));
  const ariaLabel = props["aria-label"] ?? "Progress";

  return (
    <div
      data-slot="progress"
      className={cn(
        "relative h-2.5 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]",
        className,
      )}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safe}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className="h-full bg-[hsl(var(--accent))] transition-[width] duration-300"
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}

export { Progress };

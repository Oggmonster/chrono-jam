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
        "relative h-3 w-full overflow-hidden rounded-full bg-[#d0c8ff]",
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
        className="h-full bg-[linear-gradient(90deg,#4ec7e0,#4775e6)] transition-[width] duration-300"
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}

export { Progress };

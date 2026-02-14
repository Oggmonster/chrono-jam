import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]",
        success: "bg-[hsl(155_65%_40%)] text-white",
        warning: "bg-[hsl(45_95%_52%)] text-[hsl(var(--foreground))]",
        danger: "bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]",
        info: "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]",
        listening: "bg-[hsl(200_75%_50%)] text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

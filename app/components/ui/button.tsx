import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--jam-ink)]",
  {
    variants: {
      variant: {
        default:
          "bg-[linear-gradient(180deg,var(--jam-orange),var(--jam-red))] text-amber-50 shadow-[0_4px_0_#6a2808] hover:-translate-y-0.5 border-2 border-[#6a2808]",
        success:
          "bg-[linear-gradient(180deg,#5ac758,#2b9f4c)] text-amber-50 shadow-[0_4px_0_#145e2e] hover:-translate-y-0.5 border-2 border-[#145e2e]",
        secondary:
          "bg-[linear-gradient(180deg,#637be8,#4556b9)] text-indigo-50 shadow-[0_4px_0_#28359d] hover:-translate-y-0.5 border-2 border-[#28359d]",
        outline:
          "border-2 border-indigo-300 bg-indigo-100/40 text-indigo-900 hover:bg-indigo-200/60",
        ghost: "text-indigo-100 hover:bg-indigo-200/15",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 rounded-full px-4",
        lg: "h-11 rounded-full px-6",
        icon: "h-9 w-9 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

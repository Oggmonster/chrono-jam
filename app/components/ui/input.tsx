import * as React from "react";

import { cn } from "~/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full rounded-xl border-2 border-[#7c62d9] bg-white px-3 py-2 text-base text-[#1f1f55] shadow-xs outline-none transition-[color,box-shadow] placeholder:text-[#6d64a5] focus-visible:ring-2 focus-visible:ring-[#4f3da6]",
        className,
      )}
      {...props}
    />
  );
}

export { Input };

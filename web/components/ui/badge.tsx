import * as React from "react";

import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase leading-none tracking-wider",
        "border-zinc-700 bg-zinc-800/70 text-zinc-300",
        className,
      )}
      {...props}
    />
  );
}

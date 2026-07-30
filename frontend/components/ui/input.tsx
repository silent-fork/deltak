import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-9 w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-2.5 font-mono text-sm text-zinc-100",
      "placeholder:text-zinc-600 focus:border-quantum/60 focus:ring-1 focus:ring-quantum/40",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="dk-label">{label}</span>
      {children}
      {hint ? <span className="block text-[10px] text-zinc-500">{hint}</span> : null}
    </label>
  );
}

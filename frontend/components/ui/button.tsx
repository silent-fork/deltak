"use client";

import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium uppercase tracking-wider transition-colors disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default:
          "border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
        quantum:
          "border border-quantum/60 bg-quantum/15 text-quantum hover:bg-quantum/25 shadow-quantum",
        success:
          "border border-emerald-500/60 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25",
        danger:
          "border border-rose-500/60 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25",
        ghost: "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
        outline:
          "border border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-6 px-2 text-[10px]",
        lg: "h-10 px-4 text-sm",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };

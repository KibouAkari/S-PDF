import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-ink-700 bg-ink-850 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_12px_30px_-16px_rgba(0,0,0,0.5)]",
        className
      )}
      {...props}
    />
  );
}

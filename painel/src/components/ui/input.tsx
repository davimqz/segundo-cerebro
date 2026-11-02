import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-xs border border-border-strong bg-surface px-3 text-text placeholder:text-text-muted disabled:opacity-50 aria-invalid:border-status-danger",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn("h-9 rounded-xs border border-border-strong bg-surface px-2 text-text", className)}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("rotulo text-text-muted", className)} {...props} />;
}

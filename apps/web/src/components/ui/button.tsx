import * as React from "react";

import { cn } from "@/lib/utils";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost";
};

export function Button({
  className,
  variant = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
        "disabled:pointer-events-none disabled:opacity-50",
        variant === "default" &&
          "bg-foreground text-background hover:bg-foreground/90",
        variant === "ghost" &&
          "bg-transparent hover:bg-foreground/5 text-foreground",
        "h-9 px-3",
        className,
      )}
      {...props}
    />
  );
}

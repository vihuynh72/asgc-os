import * as React from "react";

import { cn } from "@/lib/utils";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm";
};

export function Button({
  className,
  variant = "default",
  size = "default",
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
        variant === "outline" &&
          "border border-foreground/20 bg-transparent text-foreground hover:bg-foreground/5",
        size === "default" && "h-9 px-3",
        size === "sm" && "h-8 px-2 text-xs",
        className,
      )}
      {...props}
    />
  );
}

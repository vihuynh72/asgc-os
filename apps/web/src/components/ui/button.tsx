import * as React from "react";

import { cn } from "@/lib/utils";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm";
};

export function buttonClassName({
  variant = "default",
  size = "default",
  className,
}: Pick<ButtonProps, "variant" | "size" | "className">) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors active:translate-y-px",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",
    variant === "default" && "bg-primary text-primary-foreground hover:bg-primary/90",
    variant === "ghost" && "bg-transparent text-foreground hover:bg-muted/60",
    variant === "outline" && "border border-border bg-transparent text-foreground hover:bg-muted/60",
    size === "default" && "h-9 px-3",
    size === "sm" && "h-8 px-2 text-xs",
    className,
  );
}

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
      className={buttonClassName({ variant, size, className })}
      {...props}
    />
  );
}

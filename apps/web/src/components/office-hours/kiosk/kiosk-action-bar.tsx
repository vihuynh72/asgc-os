import type { ReactNode } from "react";

export function KioskActionBar({
  primary,
  secondary,
  tertiary,
  hint,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  tertiary?: ReactNode;
  hint?: string;
}) {
  return (
    <div className="kiosk-action-bar">
      <div className="kiosk-action-primary">{primary}</div>
      {secondary ? <div className="kiosk-action-secondary">{secondary}</div> : null}
      {tertiary ? <div className="kiosk-action-secondary">{tertiary}</div> : null}
      {hint ? <p className="kiosk-action-hint">{hint}</p> : null}
    </div>
  );
}

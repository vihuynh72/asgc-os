export function deriveLoginHydrationState(input) {
  const user = input?.user ?? null;
  const passwordReadyState = input?.passwordReadyState;
  const passwordReadyAt = input?.passwordReadyAt ?? null;

  if (!user) {
    return {
      existingUser: null,
      panelMode: "password",
      passwordSetupRequired: false,
    };
  }

  const existingUser = {
    email: typeof user.email === "string" ? user.email : null,
  };

  const resolvedPasswordReadyState =
    typeof passwordReadyState === "string"
      ? passwordReadyState
      : passwordReadyAt
        ? "ready"
        : "missing";

  if (resolvedPasswordReadyState === "missing") {
    return {
      existingUser,
      panelMode: "password",
      passwordSetupRequired: true,
    };
  }

  return {
    existingUser,
    panelMode: "password",
    passwordSetupRequired: false,
  };
}

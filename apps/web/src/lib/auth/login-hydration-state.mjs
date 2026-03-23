export function deriveLoginHydrationState({ user, passwordReadyAt }) {
  if (!user) {
    return {
      existingUser: null,
      panelMode: "password",
    };
  }

  const existingUser = {
    email: typeof user.email === "string" ? user.email : null,
  };

  if (!passwordReadyAt) {
    return {
      existingUser,
      panelMode: "first_time_password",
    };
  }

  return {
    existingUser,
    panelMode: "password",
  };
}

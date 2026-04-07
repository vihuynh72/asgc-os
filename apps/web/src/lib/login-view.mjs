/**
 * @param {"email" | "password"} authMode
 */
export function getLoginModeContent(authMode) {
  if (authMode === "password") {
    return {
      label: "Password",
      eyebrow: "Password",
      title: "Use your password",
      detail: "Reset it if needed.",
    };
  }

  return {
    label: "Email",
    eyebrow: "Email code",
    title: "Campus email first",
    detail: "Code only. No sign-in link.",
  };
}

/**
 * @param {{ authMode: "email" | "password"; isSubmitting: boolean; isSigningIn: boolean }} input
 */
export function getLoginPrimaryActionLabel({ authMode, isSubmitting, isSigningIn }) {
  if (authMode === "password") {
    return isSigningIn ? "Signing in..." : "Sign in";
  }

  return isSubmitting ? "Sending..." : "Send code";
}

/**
 * @param {{
 *   authMode: "email" | "password";
 *   status: "idle" | "sent" | "error";
 *   passwordStatus: "idle" | "error";
 *   resetStatus: "idle" | "sent" | "error";
 * }} input
 * @returns {{ tone: "good" | "critical"; message: string } | null}
 */
export function getLoginStatusNotice({ authMode, status, passwordStatus, resetStatus }) {
  if (authMode === "email") {
    if (status === "sent") {
      return { tone: "good", message: "Code sent. Check your email and enter it below." };
    }

    if (status === "error") {
      return { tone: "critical", message: "Could not send the sign-in email. Try again." };
    }

    return null;
  }

  if (passwordStatus === "error") {
    return { tone: "critical", message: "Sign-in failed. Check your email or password." };
  }

  if (resetStatus === "sent") {
    return { tone: "good", message: "If invited, a reset email is on the way." };
  }

  if (resetStatus === "error") {
    return { tone: "critical", message: "Could not send a reset email. Try again." };
  }

  return null;
}

/**
 * @param {"idle" | "error"} verifyStatus
 * @returns {{ tone: "critical"; message: string } | null}
 */
export function getLoginVerifyNotice(verifyStatus) {
  if (verifyStatus !== "error") return null;

  return {
    tone: "critical",
    message: "That code could not be verified. Request a new one.",
  };
}

/**
 * @param {string | null | undefined} error
 * @returns {{ tone: "critical"; message: string } | null}
 */
export function getLoginCallbackErrorNotice(error) {
  if (error === "password_setup_session_expired") {
    return {
      tone: "critical",
      message: "Your password setup session expired. Start sign-in again or request a new reset email.",
    };
  }

  return null;
}

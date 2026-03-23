import { buildAuthCodeEmail, FIRST_TIME_SIGNIN_CHALLENGE_KIND, PASSWORD_SIGNIN_CHALLENGE_KIND } from "../auth/auth-code-email.mjs";
import { buildMfaRecoveryEmail } from "../auth/mfa-recovery-email.mjs";
import { buildPasswordResetEmail } from "../auth/password-reset-email.mjs";
import { buildOfficeHoursNotificationEmail } from "../office-hours-notification-email.mjs";
import { buildAdminOverrideNotification } from "../office-hours-admin-overrides.mjs";
import { buildRoleUpdateEmail } from "../role-update-email.mjs";

const TEST_EMAIL_TEMPLATE = {
  subject: "ASGC OS: Test email",
  text: "This is a test email from ASGC OS.",
  html: undefined,
};

const GROUPS = [
  { id: "auth", label: "Auth", description: "Sign-in, password reset, and recovery emails." },
  { id: "office_hours", label: "Office Hours", description: "Reminders, auto-close notices, and session updates." },
  { id: "people_system", label: "People/System", description: "Invites, role changes, and connectivity checks." },
];

const SCENARIOS = {
  default: { id: "default", label: "Default scenario" },
  reminder_gap: { id: "reminder_gap", label: "Hours remaining" },
};

function buildOfficeHoursWeeklyPreview({ origin, scenarioId }) {
  return buildOfficeHoursNotificationEmail({
    type: "office_hours.weekly_hours_reminder",
    origin,
    metadata: {
      week_start: "2026-03-23",
      week_end: "2026-03-27",
      required_total_minutes: 480,
      total_minutes: 240,
      deficit_minutes: scenarioId === "reminder_gap" ? 240 : 90,
    },
  });
}

function buildOfficeHoursAdminUpdatePreview() {
  return buildAdminOverrideNotification({
    memberName: "Alex",
    checkoutAtIso: "2026-03-22T22:15:00.000Z",
    excludeFromTotals: false,
    reason: "Corrected after member forgot to check out.",
  });
}

function buildOfficeHoursNotificationPreview({ type, origin }) {
  return buildOfficeHoursNotificationEmail({
    type,
    origin,
    metadata: {
      elapsed_minutes: 95,
      minutes_remaining: 15,
      checkin_at_local: "2026-03-22 10:30",
      checkout_at_local: "2026-03-22 18:30",
      auto_close_at_local: "2026-03-22 18:45",
      office_tz: "America/Los_Angeles",
    },
  });
}

const TEMPLATE_DEFINITIONS = [
  {
    id: "auth_signin_code",
    groupId: "auth",
    label: "Sign-in code",
    description: "Returning member password sign-in browser verification.",
    scenarios: [SCENARIOS.default],
    buildEmail: () =>
      buildAuthCodeEmail({
        kind: PASSWORD_SIGNIN_CHALLENGE_KIND,
        code: "246813",
        expiresInMinutes: 10,
      }),
  },
  {
    id: "auth_first_signin_code",
    groupId: "auth",
    label: "First sign-in code",
    description: "First-time member onboarding code.",
    scenarios: [SCENARIOS.default],
    buildEmail: () =>
      buildAuthCodeEmail({
        kind: FIRST_TIME_SIGNIN_CHALLENGE_KIND,
        code: "135790",
        expiresInMinutes: 10,
      }),
  },
  {
    id: "auth_password_reset",
    groupId: "auth",
    label: "Password reset",
    description: "Campus password reset email.",
    scenarios: [SCENARIOS.default],
    buildEmail: ({ origin }) =>
      buildPasswordResetEmail({
        resetLink: `${origin}/auth/callback?redirectTo=%2Fdashboard&token_hash=sample-password-reset&type=recovery`,
      }),
  },
  {
    id: "auth_mfa_recovery",
    groupId: "auth",
    label: "MFA recovery",
    description: "2FA reset / recover access email.",
    scenarios: [SCENARIOS.default],
    buildEmail: ({ origin }) =>
      buildMfaRecoveryEmail({
        recoveryLink: `${origin}/auth/callback?redirectTo=%2Fmfa%2Frecover&token_hash=sample-mfa-recovery&type=recovery`,
        emailOtp: "902410",
      }),
  },
  {
    id: "office_hours_weekly_reminder",
    groupId: "office_hours",
    label: "Weekly hours reminder",
    description: "Weekly progress reminder email.",
    scenarios: [SCENARIOS.default, SCENARIOS.reminder_gap],
    buildEmail: ({ origin, scenarioId }) => buildOfficeHoursWeeklyPreview({ origin, scenarioId }),
  },
  {
    id: "office_hours_session_checkout_reminder",
    groupId: "office_hours",
    label: "Open-session reminder",
    description: "Recurring reminder to check out.",
    scenarios: [SCENARIOS.default],
    buildEmail: ({ origin }) => buildOfficeHoursNotificationPreview({ type: "office_hours.session_checkout_reminder", origin }),
  },
  {
    id: "office_hours_session_auto_close_soon",
    groupId: "office_hours",
    label: "Auto-close warning",
    description: "15-minute warning before auto-close.",
    scenarios: [SCENARIOS.default],
    buildEmail: ({ origin }) => buildOfficeHoursNotificationPreview({ type: "office_hours.session_auto_close_soon", origin }),
  },
  {
    id: "office_hours_session_auto_closed",
    groupId: "office_hours",
    label: "Auto-closed notice",
    description: "Sent after a session auto-closes.",
    scenarios: [SCENARIOS.default],
    buildEmail: ({ origin }) => buildOfficeHoursNotificationPreview({ type: "office_hours.session_auto_closed", origin }),
  },
  {
    id: "office_hours_admin_session_updated",
    groupId: "office_hours",
    label: "Admin session update",
    description: "Admin-corrected checkout notification.",
    scenarios: [SCENARIOS.default],
    buildEmail: () => buildOfficeHoursAdminUpdatePreview(),
  },
  {
    id: "people_invite_onboarding",
    groupId: "people_system",
    label: "Invite / onboarding",
    description: "First-time invite email for new members.",
    scenarios: [SCENARIOS.default],
    buildEmail: () =>
      buildAuthCodeEmail({
        kind: FIRST_TIME_SIGNIN_CHALLENGE_KIND,
        code: "314159",
        expiresInMinutes: 10,
      }),
  },
  {
    id: "people_role_update",
    groupId: "people_system",
    label: "Role update",
    description: "Role revoked / updated notification.",
    scenarios: [SCENARIOS.default],
    buildEmail: () =>
      buildRoleUpdateEmail({
        roleLabel: "Executive",
        termLabel: "Spring 2026",
        note: "Term closed after transition.",
      }),
  },
  {
    id: "system_connectivity_test",
    groupId: "people_system",
    label: "Connectivity test",
    description: "Basic email delivery test.",
    scenarios: [SCENARIOS.default],
    buildEmail: () => ({ ...TEST_EMAIL_TEMPLATE }),
  },
];

function getTemplateById(templateId) {
  return TEMPLATE_DEFINITIONS.find((template) => template.id === templateId) ?? null;
}

export function getAdminCommunicationsAccess({ tier, isEvp }) {
  if (tier === "full") {
    return {
      canAccess: true,
      canSend: true,
      allowedGroupIds: ["auth", "office_hours", "people_system"],
    };
  }

  if (isEvp) {
    return {
      canAccess: true,
      canSend: tier !== "read-only",
      allowedGroupIds: ["office_hours"],
    };
  }

  if (tier === "read-only") {
    return {
      canAccess: true,
      canSend: false,
      allowedGroupIds: ["office_hours"],
    };
  }

  return {
    canAccess: false,
    canSend: false,
    allowedGroupIds: [],
  };
}

export function getAdminCommunicationTemplateGroups(access) {
  return GROUPS.filter((group) => access.allowedGroupIds.includes(group.id));
}

export function getAdminCommunicationTemplates(access) {
  return TEMPLATE_DEFINITIONS.filter((template) => access.allowedGroupIds.includes(template.groupId)).map((template) => ({
    id: template.id,
    groupId: template.groupId,
    label: template.label,
    description: template.description,
    scenarios: template.scenarios,
  }));
}

export function buildAdminCommunicationPreview({ access, templateId, scenarioId, origin }) {
  const template = getTemplateById(templateId);
  if (!template) throw new Error("not_found");
  if (!access.allowedGroupIds.includes(template.groupId)) throw new Error("forbidden");

  const scenario = template.scenarios.find((entry) => entry.id === scenarioId) ?? template.scenarios[0];
  if (!scenario) throw new Error("scenario_not_found");

  const email = template.buildEmail({ origin, scenarioId: scenario.id });
  const group = GROUPS.find((entry) => entry.id === template.groupId);
  if (!group) throw new Error("group_not_found");

  return {
    group,
    template: {
      id: template.id,
      groupId: template.groupId,
      label: template.label,
      description: template.description,
    },
    scenario,
    email,
  };
}

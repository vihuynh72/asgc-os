import { getAdminCommunicationTemplateById } from "./communications.mjs";

const SESSION_REMINDER_TYPES = {
  office_hours_session_checkout_reminder: "office_hours.session_checkout_reminder",
  office_hours_session_auto_close_soon: "office_hours.session_auto_close_soon",
  office_hours_session_auto_closed: "office_hours.session_auto_closed",
};

const ROLE_LABEL_BY_KEY = {
  advisor: "Advisor",
  president: "President",
  executive: "Executive",
  board_member: "Board member",
  volunteer: "Volunteer",
};

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function safeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function addDaysDateOnly(dateOnly, days) {
  const base = new Date(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return dateOnly;
  base.setUTCDate(base.getUTCDate() + days);
  return `${base.getUTCFullYear()}-${pad2(base.getUTCMonth() + 1)}-${pad2(base.getUTCDate())}`;
}

function formatMinutes(totalMinutes) {
  const rounded = Math.max(0, Math.round(safeNumber(totalMinutes) ?? 0));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return `${hours}h ${minutes}m`;
}

function formatLocalDateTime(iso, timeZone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function formatSourceTimestamp(iso, timeZone) {
  const local = formatLocalDateTime(iso, timeZone);
  return local || safeString(iso);
}

function buildSourceDescription({ templateId, sessionId }) {
  if (templateId === "office_hours_session_auto_closed") {
    return `Auto-closed session ${sessionId}`;
  }
  if (templateId === "office_hours_session_auto_close_soon") {
    return `Auto-close warning for session ${sessionId}`;
  }
  return `Open-session reminder for session ${sessionId}`;
}

function buildMemberLabel({ userId, displayName, email }) {
  return safeString(displayName) || safeString(email) || `Member ${safeString(userId).slice(0, 8) || "unknown"}`;
}

function buildMemberDescription(email) {
  return safeString(email) || "No email on file";
}

function readJsonObject(value) {
  return typeof value === "object" && value !== null ? value : {};
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.length > 0)));
}

function buildWeeklySource({ row, displayName, email }) {
  const userId = safeString(row.user_id);
  const weekStart = safeString(row.week_start);
  const requiredTotalMinutes = safeNumber(row.required_total_minutes) ?? 0;
  const totalMinutes = safeNumber(row.total_minutes) ?? 0;
  const deficitMinutes = safeNumber(row.deficit_minutes) ?? 0;

  return {
    id: `weekly:${userId}:${weekStart}`,
    templateId: "office_hours_weekly_reminder",
    sourceType: "office_hours_weekly",
    recordType: "admin_weekly_hours",
    label: buildMemberLabel({ userId, displayName, email }),
    description: `Week of ${weekStart} • Remaining ${formatMinutes(deficitMinutes)} • Completed ${formatMinutes(totalMinutes)}`,
    data: {
      week_start: weekStart,
      week_end: addDaysDateOnly(weekStart, 4),
      required_total_minutes: requiredTotalMinutes,
      total_minutes: totalMinutes,
      deficit_minutes: deficitMinutes,
    },
  };
}

function buildSessionNotificationSource({ templateId, notification, displayName, email }) {
  const metadata = readJsonObject(notification.metadata);
  const sessionId = safeString(metadata.session_id);
  const type = SESSION_REMINDER_TYPES[templateId] ?? safeString(notification.type);
  return {
    id: `notification:${notification.id}`,
    templateId,
    sourceType: "office_hours_session",
    recordType: "notification_log",
    label: buildMemberLabel({ userId: notification.user_id, displayName, email }),
    description: `${type} • ${formatSourceTimestamp(notification.created_at, safeString(metadata.office_tz) || "America/Los_Angeles")}`,
    data: {
      ...metadata,
      session_id: sessionId || undefined,
    },
  };
}

function buildRoleUpdateSource({ notification, displayName, email, termLabel }) {
  const metadata = readJsonObject(notification.metadata);
  const roleKey = safeString(metadata.role_key);
  const roleLabel = ROLE_LABEL_BY_KEY[roleKey] || roleKey || "Role";
  return {
    id: `notification:${notification.id}`,
    templateId: "people_role_update",
    sourceType: "role_update",
    recordType: "notification_log",
    label: buildMemberLabel({ userId: notification.user_id, displayName, email }),
    description: `${roleLabel} • ${termLabel}`,
    data: {
      roleKey,
      roleLabel,
      termLabel,
      note: safeString(metadata.note),
      term_id: safeString(metadata.term_id) || null,
    },
  };
}

function buildAdminOverrideSource({ session, displayName, email }) {
  return {
    id: `session:${session.id}`,
    templateId: "office_hours_admin_session_updated",
    sourceType: "office_hours_admin_override",
    recordType: "office_hour_session",
    label: buildMemberLabel({ userId: session.user_id, displayName, email }),
    description: `Admin-updated session ${session.id}`,
    data: {
      memberName: safeString(displayName),
      checkoutAtIso: safeString(session.admin_adjusted_checkout_at) || safeString(session.checkout_at),
      excludeFromTotals: session.admin_exclude_from_totals === true,
      reason: safeString(session.admin_closed_reason),
    },
  };
}

async function loadUserDirectory(admin, userIds) {
  const ids = uniqueStrings(userIds);
  if (ids.length === 0) return { displayNameById: new Map(), emailById: new Map() };

  const [{ data: profiles, error: profilesError }, { data: privates, error: privatesError }] = await Promise.all([
    admin.from("profiles").select("id,display_name").in("id", ids),
    admin.from("profile_private").select("id,email").in("id", ids),
  ]);

  if (profilesError || privatesError) {
    throw new Error(profilesError?.message || privatesError?.message || "directory_lookup_failed");
  }

  const displayNameById = new Map();
  for (const row of profiles ?? []) {
    displayNameById.set(row.id, row.display_name ?? "");
  }

  const emailById = new Map();
  for (const row of privates ?? []) {
    emailById.set(row.id, row.email ?? "");
  }

  return { displayNameById, emailById };
}

async function loadOfficeHoursConfig(admin) {
  const { data: configRow, error: configError } = await admin
    .from("office_config")
    .select("max_session_hours,primary_office_location_id")
    .eq("id", true)
    .maybeSingle();

  if (configError) {
    throw new Error(configError.message || "office_config_lookup_failed");
  }

  const maxSessionHours = Math.max(1, Math.round(safeNumber(configRow?.max_session_hours) ?? 8));
  const primaryOfficeLocationId = safeString(configRow?.primary_office_location_id);

  let officeTz = "America/Los_Angeles";
  if (primaryOfficeLocationId) {
    const { data: locationRow, error: locationError } = await admin
      .from("office_locations")
      .select("timezone")
      .eq("id", primaryOfficeLocationId)
      .maybeSingle();
    if (locationError) {
      throw new Error(locationError.message || "office_location_lookup_failed");
    }
    officeTz = safeString(locationRow?.timezone) || officeTz;
  }

  return { maxSessionHours, officeTz };
}

async function loadLocationTimezones(admin, locationIds) {
  const ids = uniqueStrings(locationIds);
  if (ids.length === 0) return new Map();

  const { data, error } = await admin.from("office_locations").select("id,timezone").in("id", ids);
  if (error) throw new Error(error.message || "office_location_lookup_failed");

  const timezonesById = new Map();
  for (const row of data ?? []) {
    timezonesById.set(row.id, safeString(row.timezone));
  }
  return timezonesById;
}

async function loadTermLabels(admin, termIds) {
  const ids = uniqueStrings(termIds);
  if (ids.length === 0) return new Map();

  const { data, error } = await admin.from("terms").select("id,name").in("id", ids);
  if (error) throw new Error(error.message || "term_lookup_failed");

  const labels = new Map();
  for (const row of data ?? []) {
    labels.set(row.id, safeString(row.name) || row.id);
  }
  return labels;
}

export function parseAdminCommunicationSourceId(sourceId) {
  if (typeof sourceId !== "string" || sourceId.length === 0) return null;
  const [kind, primaryId, secondaryId] = sourceId.split(":");
  if (!kind || !primaryId) return null;
  if (!["weekly", "session", "notification"].includes(kind)) return null;

  return {
    kind,
    primaryId,
    secondaryId: secondaryId ?? null,
  };
}

export function buildOfficeHoursSessionRealSource({
  templateId,
  session,
  memberLabel,
  officeTz = "America/Los_Angeles",
  maxSessionHours = 8,
  nowIso = new Date().toISOString(),
}) {
  const checkinMs = Date.parse(session?.checkin_at ?? "");
  const checkoutMs = Date.parse(session?.checkout_at ?? "");
  const nowMs = Date.parse(nowIso);
  const autoCloseMs = Number.isFinite(checkinMs) ? checkinMs + maxSessionHours * 60 * 60 * 1000 : Number.NaN;

  const elapsedMinutes =
    Number.isFinite(checkinMs) && Number.isFinite(nowMs) ? Math.max(Math.round((nowMs - checkinMs) / 60000), 0) : 0;
  const checkinAtLocal = formatLocalDateTime(session?.checkin_at ?? "", officeTz);
  const autoCloseAtLocal = Number.isFinite(autoCloseMs) ? formatLocalDateTime(new Date(autoCloseMs).toISOString(), officeTz) : "";
  const checkoutAtLocal = Number.isFinite(checkoutMs) ? formatLocalDateTime(session.checkout_at, officeTz) : "";
  const minutesRemaining =
    Number.isFinite(autoCloseMs) && Number.isFinite(nowMs) ? Math.max(Math.round((autoCloseMs - nowMs) / 60000), 0) : 0;

  return {
    id: `session:${session.id}`,
    templateId,
    sourceType: "office_hours_session",
    label: memberLabel,
    description: buildSourceDescription({ templateId, sessionId: session.id }),
    data: {
      session_id: session.id,
      checkin_at: session.checkin_at,
      checkout_at: session.checkout_at ?? null,
      elapsed_minutes: elapsedMinutes,
      minutes_remaining: minutesRemaining,
      office_tz: officeTz,
      checkin_at_local: checkinAtLocal,
      auto_close_at_local: autoCloseAtLocal,
      checkout_at_local: checkoutAtLocal,
    },
  };
}

async function listWeeklyReminderSources({ admin, viewer, preferredUserId }) {
  const { data, error } = await viewer.rpc("admin_weekly_hours", { _week_start: null });
  if (error) throw new Error(error.message || "admin_weekly_hours_failed");

  const rows = (data ?? []).filter((row) => !preferredUserId || row.user_id === preferredUserId);
  const { displayNameById, emailById } = await loadUserDirectory(
    admin,
    rows.map((row) => row.user_id),
  );

  return rows.slice(0, 50).map((row) =>
    buildWeeklySource({
      row,
      displayName: displayNameById.get(row.user_id),
      email: emailById.get(row.user_id),
    }),
  );
}

async function listSessionNotificationSources({ admin, templateId, preferredUserId }) {
  const type = SESSION_REMINDER_TYPES[templateId];
  if (!type) return [];

  let query = admin
    .from("notification_log")
    .select("id,user_id,type,metadata,created_at")
    .eq("type", type)
    .eq("channel", "email")
    .order("created_at", { ascending: false })
    .limit(15);

  if (preferredUserId) query = query.eq("user_id", preferredUserId);

  const { data, error } = await query;
  if (error) throw new Error(error.message || "notification_log_lookup_failed");

  const rows = data ?? [];
  const { displayNameById, emailById } = await loadUserDirectory(
    admin,
    rows.map((row) => row.user_id),
  );

  return rows.map((row) =>
    buildSessionNotificationSource({
      templateId,
      notification: row,
      displayName: displayNameById.get(row.user_id),
      email: emailById.get(row.user_id),
    }),
  );
}

async function listEligibleSessionSources({ admin, templateId, preferredUserId, nowIso }) {
  const { maxSessionHours, officeTz } = await loadOfficeHoursConfig(admin);
  const nowMs = Date.parse(nowIso);

  let query = admin
    .from("office_hour_sessions")
    .select("id,user_id,office_location_id,checkin_at,checkout_at,status,next_checkout_reminder_at,kiosk_auth_method")
    .order("checkin_at", { ascending: false })
    .limit(20);

  if (preferredUserId) query = query.eq("user_id", preferredUserId);

  if (templateId === "office_hours_session_auto_closed") {
    query = query.eq("status", "auto_closed");
  } else {
    query = query.eq("status", "open").is("checkout_at", null);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message || "office_hour_sessions_lookup_failed");

  const rows = (data ?? []).filter((row) => safeString(row.kiosk_auth_method) !== "sms_otp");
  const { displayNameById, emailById } = await loadUserDirectory(
    admin,
    rows.map((row) => row.user_id),
  );
  const timezonesById = await loadLocationTimezones(
    admin,
    rows.map((row) => row.office_location_id),
  );

  return rows
    .filter((row) => {
      if (templateId === "office_hours_session_auto_closed") return !!safeString(row.checkout_at);

      const email = safeString(emailById.get(row.user_id));
      if (!email) return false;
      const checkinMs = Date.parse(row.checkin_at);
      if (!Number.isFinite(checkinMs) || !Number.isFinite(nowMs)) return false;

      if (templateId === "office_hours_session_checkout_reminder") {
        const nextReminderMs = row.next_checkout_reminder_at
          ? Date.parse(row.next_checkout_reminder_at)
          : checkinMs + 60 * 60 * 1000;
        return Number.isFinite(nextReminderMs) && nextReminderMs <= nowMs;
      }

      if (templateId === "office_hours_session_auto_close_soon") {
        const autoCloseMs = checkinMs + maxSessionHours * 60 * 60 * 1000;
        return nowMs >= autoCloseMs - 15 * 60 * 1000 && nowMs < autoCloseMs;
      }

      return true;
    })
    .slice(0, 15)
    .map((row) =>
      buildOfficeHoursSessionRealSource({
        templateId,
        session: row,
        memberLabel: buildMemberLabel({
          userId: row.user_id,
          displayName: displayNameById.get(row.user_id),
          email: emailById.get(row.user_id),
        }),
        officeTz: timezonesById.get(row.office_location_id) || officeTz,
        maxSessionHours,
        nowIso,
      }),
    );
}

async function listAdminOverrideSources({ admin, preferredUserId }) {
  let query = admin
    .from("office_hour_sessions")
    .select("id,user_id,checkout_at,admin_adjusted_checkout_at,admin_exclude_from_totals,admin_closed_reason,admin_closed_at")
    .not("admin_closed_at", "is", null)
    .order("admin_closed_at", { ascending: false })
    .limit(15);

  if (preferredUserId) query = query.eq("user_id", preferredUserId);

  const { data, error } = await query;
  if (error) throw new Error(error.message || "admin_override_lookup_failed");

  const rows = data ?? [];
  const { displayNameById, emailById } = await loadUserDirectory(
    admin,
    rows.map((row) => row.user_id),
  );

  return rows.map((row) =>
    buildAdminOverrideSource({
      session: row,
      displayName: displayNameById.get(row.user_id),
      email: emailById.get(row.user_id),
    }),
  );
}

async function listRoleUpdateSources({ admin }) {
  const { data, error } = await admin
    .from("notification_log")
    .select("id,user_id,metadata,created_at")
    .eq("type", "role_revoked")
    .eq("channel", "email")
    .order("created_at", { ascending: false })
    .limit(15);

  if (error) throw new Error(error.message || "role_update_lookup_failed");

  const rows = data ?? [];
  const { displayNameById, emailById } = await loadUserDirectory(
    admin,
    rows.map((row) => row.user_id),
  );
  const termLabels = await loadTermLabels(
    admin,
    rows.map((row) => safeString(readJsonObject(row.metadata).term_id)),
  );

  return rows.map((row) => {
    const metadata = readJsonObject(row.metadata);
    const termId = safeString(metadata.term_id);
    return buildRoleUpdateSource({
      notification: row,
      displayName: displayNameById.get(row.user_id),
      email: emailById.get(row.user_id),
      termLabel: termLabels.get(termId) || (termId ? termId : "Global"),
    });
  });
}

async function getSessionSourceById({ admin, templateId, sessionId, nowIso }) {
  const { data, error } = await admin
    .from("office_hour_sessions")
    .select("id,user_id,office_location_id,checkin_at,checkout_at,status,next_checkout_reminder_at,kiosk_auth_method,admin_adjusted_checkout_at,admin_exclude_from_totals,admin_closed_reason")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) throw new Error(error.message || "office_hour_session_lookup_failed");
  if (!data?.id) throw new Error("source_not_found");

  const { displayNameById, emailById } = await loadUserDirectory(admin, [data.user_id]);
  const { maxSessionHours, officeTz } = await loadOfficeHoursConfig(admin);
  const timezonesById = await loadLocationTimezones(admin, [data.office_location_id]);

  if (templateId === "office_hours_admin_session_updated") {
    return buildAdminOverrideSource({
      session: data,
      displayName: displayNameById.get(data.user_id),
      email: emailById.get(data.user_id),
    });
  }

  return buildOfficeHoursSessionRealSource({
    templateId,
    session: data,
    memberLabel: buildMemberLabel({
      userId: data.user_id,
      displayName: displayNameById.get(data.user_id),
      email: emailById.get(data.user_id),
    }),
    officeTz: timezonesById.get(data.office_location_id) || officeTz,
    maxSessionHours,
    nowIso,
  });
}

async function getNotificationSourceById({ admin, viewer, templateId, notificationId }) {
  const { data, error } = await admin
    .from("notification_log")
    .select("id,user_id,type,metadata,created_at")
    .eq("id", notificationId)
    .maybeSingle();

  if (error) throw new Error(error.message || "notification_log_lookup_failed");
  if (!data?.id) throw new Error("source_not_found");

  const { displayNameById, emailById } = await loadUserDirectory(admin, [data.user_id]);

  if (templateId === "people_role_update") {
    const metadata = readJsonObject(data.metadata);
    const termId = safeString(metadata.term_id);
    const termLabels = await loadTermLabels(admin, [termId]);
    return buildRoleUpdateSource({
      notification: data,
      displayName: displayNameById.get(data.user_id),
      email: emailById.get(data.user_id),
      termLabel: termLabels.get(termId) || (termId ? termId : "Global"),
    });
  }

  if (!Object.values(SESSION_REMINDER_TYPES).includes(safeString(data.type))) {
    throw new Error("source_not_found");
  }

  return buildSessionNotificationSource({
    templateId,
    notification: data,
    displayName: displayNameById.get(data.user_id),
    email: emailById.get(data.user_id),
  });
}

async function getWeeklySourceById({ admin, viewer, userId, weekStart }) {
  const { data, error } = await viewer.rpc("admin_weekly_hours", { _week_start: weekStart });
  if (error) throw new Error(error.message || "admin_weekly_hours_failed");

  const row = (data ?? []).find((entry) => safeString(entry.user_id) === userId && safeString(entry.week_start) === weekStart);
  if (!row) throw new Error("source_not_found");

  const { displayNameById, emailById } = await loadUserDirectory(admin, [userId]);
  return buildWeeklySource({
    row,
    displayName: displayNameById.get(userId),
    email: emailById.get(userId),
  });
}

function assertRealModeTemplate({ access, templateId }) {
  const template = getAdminCommunicationTemplateById(templateId);
  if (!template) throw new Error("not_found");
  if (!access.allowedGroupIds.includes(template.groupId)) throw new Error("forbidden");
  if (!Array.isArray(template.supportedModes) || !template.supportedModes.includes("real")) {
    throw new Error("real_mode_not_supported");
  }
  return template;
}

/**
 * @param {{
 *   access: { allowedGroupIds: string[] };
 *   templateId: string;
 *   admin: any;
 *   viewer: any;
 *   preferredUserId?: string | null;
 *   nowIso?: string;
 * }} input
 */
export async function listAdminCommunicationRealSources({
  access,
  templateId,
  admin,
  viewer,
  preferredUserId = null,
  nowIso = new Date().toISOString(),
}) {
  assertRealModeTemplate({ access, templateId });

  if (templateId === "office_hours_weekly_reminder") {
    return listWeeklyReminderSources({ admin, viewer, preferredUserId });
  }
  if (templateId === "office_hours_admin_session_updated") {
    return listAdminOverrideSources({ admin, preferredUserId });
  }
  if (templateId === "people_role_update") {
    return listRoleUpdateSources({ admin });
  }
  if (templateId in SESSION_REMINDER_TYPES) {
    const notificationSources = await listSessionNotificationSources({ admin, templateId, preferredUserId });
    if (notificationSources.length > 0) return notificationSources;
    return listEligibleSessionSources({ admin, templateId, preferredUserId, nowIso });
  }

  return [];
}

/**
 * @param {{
 *   access: { allowedGroupIds: string[] };
 *   templateId: string;
 *   sourceId: string;
 *   admin: any;
 *   viewer: any;
 *   nowIso?: string;
 * }} input
 */
export async function loadAdminCommunicationRealSource({
  access,
  templateId,
  sourceId,
  admin,
  viewer,
  nowIso = new Date().toISOString(),
}) {
  assertRealModeTemplate({ access, templateId });

  const parsed = parseAdminCommunicationSourceId(sourceId);
  if (!parsed) throw new Error("source_not_found");

  if (parsed.kind === "weekly") {
    return getWeeklySourceById({
      admin,
      viewer,
      userId: parsed.primaryId,
      weekStart: parsed.secondaryId ?? "",
    });
  }

  if (parsed.kind === "session") {
    return getSessionSourceById({
      admin,
      templateId,
      sessionId: parsed.primaryId,
      nowIso,
    });
  }

  if (parsed.kind === "notification") {
    return getNotificationSourceById({
      admin,
      viewer,
      templateId,
      notificationId: parsed.primaryId,
    });
  }

  throw new Error("source_not_found");
}

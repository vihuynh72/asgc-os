import { buildAdminCommunicationPreview, getAdminCommunicationTemplates } from "./communications.mjs";

/**
 * @param {{
 *   access: { canAccess: boolean; canSend: boolean; allowedGroupIds: string[] };
 *   preferredGroupId?: string | null;
 * }} input
 */
export function getDefaultAdminCommunicationSelection({ access, preferredGroupId = null }) {
  const templates = getAdminCommunicationTemplates(access);
  const preferredTemplate =
    templates.find((template) => template.groupId === preferredGroupId) ??
    templates[0] ??
    null;

  return preferredTemplate
    ? {
        groupId: preferredTemplate.groupId,
        templateId: preferredTemplate.id,
        mode: "sample",
        scenarioId: preferredTemplate.scenarios[0]?.id ?? "default",
      }
    : null;
}

/**
 * @param {{
 *   access: { canAccess: boolean; canSend: boolean; allowedGroupIds: string[] };
 *   actorUserId: string;
 *   recipientEmail: string;
 *   templateId: string;
 *   mode: "sample" | "real";
 *   scenarioId: string;
 *   source?: {
 *     id: string;
 *     templateId: string;
 *     sourceType: string;
 *     label: string;
 *     description: string;
 *     data: Record<string, unknown>;
 *   } | null;
 *   origin: string;
 * }} input
 */
export function buildAdminCommunicationSendInput({ access, actorUserId, recipientEmail, templateId, mode, scenarioId, source = null, origin }) {
  if (!access.canSend) throw new Error("forbidden");
  const preview = buildAdminCommunicationPreview({ access, templateId, mode, scenarioId, source, origin });

  return {
    toEmail: recipientEmail,
    email: preview.email,
    notification: {
      actor_user_id: actorUserId,
      user_id: actorUserId,
      type: "admin.communication_test",
      channel: "email",
      provider: "resend",
      to_email: recipientEmail,
      subject: preview.email.subject,
      status: "queued",
      metadata: {
        group_id: preview.group.id,
        template_id: preview.template.id,
        mode: preview.mode,
        scenario_id: preview.scenario?.id ?? null,
        source_id: preview.source?.id ?? null,
      },
    },
    preview,
  };
}

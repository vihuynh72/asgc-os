"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CommunicationsScenario = {
  id: string;
  label: string;
};

type CommunicationsGroup = {
  id: string;
  label: string;
  description: string;
};

type CommunicationsTemplate = {
  id: string;
  groupId: string;
  label: string;
  description: string;
  scenarios: CommunicationsScenario[];
};

type CommunicationSelection = {
  groupId: string;
  templateId: string;
  scenarioId: string;
} | null;

type CommunicationPreview = {
  group: CommunicationsGroup;
  template: {
    id: string;
    groupId: string;
    label: string;
    description: string;
  };
  scenario: CommunicationsScenario;
  email: {
    subject: string;
    text: string;
    html?: string;
  };
};

type SendResult = {
  to: string;
  subject: string;
  providerMessageId: string | null;
  notificationId: string | null;
  templateId: string;
  scenarioId: string;
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    const message = (data as { error?: string }).error || `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return data;
}

export function AdminCommunicationsLab({
  groups,
  templates,
  initialSelection,
  canSend,
  mode = "full",
  fullLabHref = "/admin/communications",
}: {
  groups: CommunicationsGroup[];
  templates: CommunicationsTemplate[];
  initialSelection: CommunicationSelection;
  canSend: boolean;
  mode?: "full" | "compact";
  fullLabHref?: string;
}) {
  const isCompact = mode === "compact";
  const [groupId, setGroupId] = useState(initialSelection?.groupId ?? groups[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(initialSelection?.templateId ?? templates[0]?.id ?? "");
  const [scenarioId, setScenarioId] = useState(initialSelection?.scenarioId ?? templates[0]?.scenarios[0]?.id ?? "default");
  const [preview, setPreview] = useState<CommunicationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [previewMode, setPreviewMode] = useState<"html" | "text">("html");

  const filteredTemplates = useMemo(
    () => templates.filter((template) => template.groupId === groupId),
    [groupId, templates],
  );

  const selectedTemplate = useMemo(
    () => filteredTemplates.find((template) => template.id === templateId) ?? filteredTemplates[0] ?? null,
    [filteredTemplates, templateId],
  );

  const selectedScenario = useMemo(
    () => selectedTemplate?.scenarios.find((scenario) => scenario.id === scenarioId) ?? selectedTemplate?.scenarios[0] ?? null,
    [scenarioId, selectedTemplate],
  );

  useEffect(() => {
    if (!selectedTemplate) return;
    if (selectedTemplate.id !== templateId) {
      setTemplateId(selectedTemplate.id);
      return;
    }

    if (selectedScenario && selectedScenario.id !== scenarioId) {
      setScenarioId(selectedScenario.id);
    }
  }, [scenarioId, selectedScenario, selectedTemplate, templateId]);

  useEffect(() => {
    if (!selectedTemplate || !selectedScenario) {
      setPreview(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    void postJson<{ ok: true; preview: CommunicationPreview }>("/api/admin/communications/preview", {
      templateId: selectedTemplate.id,
      scenarioId: selectedScenario.id,
    })
      .then((data) => {
        if (cancelled) return;
        setPreview(data.preview);
        if (!data.preview.email.html) setPreviewMode("text");
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load preview.");
        setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedScenario, selectedTemplate]);

  async function onSend() {
    if (!selectedTemplate || !selectedScenario) return;

    setSending(true);
    setSendError("");

    try {
      const data = await postJson<SendResult & { ok: true }>("/api/admin/communications/send", {
        templateId: selectedTemplate.id,
        scenarioId: selectedScenario.id,
      });
      setSendResult({
        to: data.to,
        subject: data.subject,
        providerMessageId: data.providerMessageId,
        notificationId: data.notificationId,
        templateId: data.templateId,
        scenarioId: data.scenarioId,
      });
    } catch (nextError) {
      setSendError(nextError instanceof Error ? nextError.message : "Failed to send test email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={cn("space-y-4", !isCompact && "space-y-5")}>
      <div className="flex flex-wrap gap-2">
        {groups.map((group) => {
          const active = group.id === groupId;
          return (
            <button
              key={group.id}
              type="button"
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition",
                active
                  ? "border-[rgb(0_104_94_/_0.18)] bg-[rgb(230_248_244)] text-[rgb(0_104_94)]"
                  : "border-black/8 bg-white text-foreground/72 hover:bg-[rgb(247_248_246)]",
              )}
              onClick={() => setGroupId(group.id)}
            >
              {group.label}
            </button>
          );
        })}
      </div>

      {!isCompact ? (
        <div className="rounded-[1.45rem] border border-black/6 bg-[color:var(--admin-surface-raised)] p-4 text-sm text-foreground/68">
          {groups.find((group) => group.id === groupId)?.description ?? "Preview and test real production emails safely."}
        </div>
      ) : null}

      <div className={cn("grid gap-3", isCompact ? "md:grid-cols-[1.1fr_0.9fr]" : "xl:grid-cols-[1.1fr_0.9fr]")}>
        <div className="space-y-3 rounded-[1.6rem] border border-black/6 bg-[color:var(--admin-surface-raised)] p-4 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.18)]">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <div className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-foreground/48">Template</div>
              <select
                className="h-12 w-full rounded-[1rem] border border-black/8 bg-white px-4 text-sm"
                value={selectedTemplate?.id ?? ""}
                onChange={(event) => setTemplateId(event.target.value)}
              >
                {filteredTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <div className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-foreground/48">Scenario</div>
              <select
                className="h-12 w-full rounded-[1rem] border border-black/8 bg-white px-4 text-sm"
                value={selectedScenario?.id ?? ""}
                onChange={(event) => setScenarioId(event.target.value)}
                disabled={!selectedTemplate}
              >
                {(selectedTemplate?.scenarios ?? []).map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-[1.2rem] border border-black/6 bg-white px-4 py-3">
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-foreground/48">Selected email</div>
            <div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
              {selectedTemplate?.label ?? "No template selected"}
            </div>
            <div className="mt-1 text-sm leading-6 text-foreground/65">{selectedTemplate?.description ?? "Choose a template to load its preview."}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition",
                previewMode === "html"
                  ? "border-[rgb(0_104_94_/_0.18)] bg-[rgb(230_248_244)] text-[rgb(0_104_94)]"
                  : "border-black/8 bg-white text-foreground/68",
              )}
              onClick={() => setPreviewMode("html")}
            >
              HTML preview
            </button>
            <button
              type="button"
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition",
                previewMode === "text"
                  ? "border-[rgb(0_104_94_/_0.18)] bg-[rgb(230_248_244)] text-[rgb(0_104_94)]"
                  : "border-black/8 bg-white text-foreground/68",
              )}
              onClick={() => setPreviewMode("text")}
            >
              Plain text
            </button>
          </div>

          <div className="min-h-[18rem] rounded-[1.4rem] border border-black/6 bg-white p-3">
            {loading ? (
              <div className="flex min-h-[16rem] items-center justify-center text-sm text-foreground/58">Loading preview…</div>
            ) : error ? (
              <div className="rounded-[1rem] border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            ) : previewMode === "html" ? (
              preview?.email.html ? (
                <iframe
                  title="Email HTML preview"
                  srcDoc={preview.email.html}
                  className="h-[28rem] w-full rounded-[1rem] border border-black/6 bg-white"
                />
              ) : (
                <div className="flex min-h-[16rem] items-center justify-center text-sm text-foreground/58">This template currently sends plain text only.</div>
              )
            ) : (
              <pre className="h-[28rem] overflow-auto whitespace-pre-wrap rounded-[1rem] bg-[rgb(248_249_246)] p-4 text-sm leading-7 text-foreground/78">
                {preview?.email.text ?? "No preview loaded."}
              </pre>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-[1.6rem] border border-black/6 bg-[color:var(--admin-surface-raised)] p-4 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.18)]">
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-foreground/48">Subject</div>
            <div className="mt-2 text-[1.15rem] font-semibold tracking-[-0.03em] text-foreground">
              {preview?.email.subject ?? "Select a template"}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {canSend ? (
                <Button onClick={() => void onSend()} disabled={sending || !selectedTemplate || !selectedScenario} className="h-11 rounded-full px-5">
                  {sending ? "Sending…" : "Send to my email"}
                </Button>
              ) : (
                <div className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
                  Preview only
                </div>
              )}
              {isCompact ? (
                <Link href={fullLabHref} className="inline-flex h-11 items-center justify-center rounded-full border border-black/8 bg-white px-5 text-sm font-medium text-foreground/78">
                  Open full lab
                </Link>
              ) : null}
            </div>
            <div className="mt-3 text-sm leading-6 text-foreground/62">
              Test sends only go to the signed-in admin email. No member-facing workflow is triggered from this panel.
            </div>
          </div>

          {sendResult ? (
            <div className="rounded-[1.45rem] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <div className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-emerald-700">Last test send</div>
              <div className="mt-2 font-medium">{sendResult.to}</div>
              <div className="mt-1 text-emerald-800/85">Message ID: {sendResult.providerMessageId ?? "Pending"}</div>
              <div className="text-emerald-800/85">Log ID: {sendResult.notificationId ?? "Not recorded"}</div>
            </div>
          ) : null}

          {sendError ? (
            <div className="rounded-[1.45rem] border border-red-200 bg-red-50 p-4 text-sm text-red-700">{sendError}</div>
          ) : null}

          <div className="rounded-[1.6rem] border border-black/6 bg-[color:var(--admin-surface-raised)] p-4 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.18)]">
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-foreground/48">Catalog</div>
            <div className="mt-3 space-y-2">
              {filteredTemplates.map((template) => {
                const active = template.id === selectedTemplate?.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    className={cn(
                      "w-full rounded-[1.2rem] border px-4 py-3 text-left transition",
                      active
                        ? "border-[rgb(0_104_94_/_0.18)] bg-[rgb(230_248_244)]"
                        : "border-black/6 bg-white hover:bg-[rgb(248_249_246)]",
                    )}
                    onClick={() => setTemplateId(template.id)}
                  >
                    <div className="text-sm font-semibold tracking-[-0.02em] text-foreground">{template.label}</div>
                    <div className="mt-1 text-sm leading-6 text-foreground/62">{template.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

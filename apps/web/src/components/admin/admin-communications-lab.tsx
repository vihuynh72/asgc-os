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
  supportedModes: string[];
  sourceType: string | null;
};

type CommunicationSelection = {
  groupId: string;
  templateId: string;
  mode: string;
  scenarioId: string;
} | null;

type CommunicationSource = {
  id: string;
  templateId: string;
  sourceType: string;
  recordType?: string;
  label: string;
  description: string;
};

type CommunicationPreview = {
  group: CommunicationsGroup;
  mode: string;
  template: {
    id: string;
    groupId: string;
    label: string;
    description: string;
    supportedModes: Array<"sample" | "real">;
    sourceType: string | null;
  };
  scenario?: CommunicationsScenario;
  source?: CommunicationSource;
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
  mode: "sample" | "real";
  scenarioId: string | null;
  sourceId: string | null;
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
  contextUserId = null,
}: {
  groups: CommunicationsGroup[];
  templates: CommunicationsTemplate[];
  initialSelection: CommunicationSelection;
  canSend: boolean;
  mode?: "full" | "compact";
  fullLabHref?: string;
  contextUserId?: string | null;
}) {
  const isCompact = mode === "compact";
  const [groupId, setGroupId] = useState(initialSelection?.groupId ?? groups[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(initialSelection?.templateId ?? templates[0]?.id ?? "");
  const [dataMode, setDataMode] = useState<"sample" | "real">(initialSelection?.mode === "real" ? "real" : "sample");
  const [scenarioId, setScenarioId] = useState(initialSelection?.scenarioId ?? templates[0]?.scenarios[0]?.id ?? "default");
  const [sourceId, setSourceId] = useState<string>("");
  const [sources, setSources] = useState<CommunicationSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesError, setSourcesError] = useState("");
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
  const selectedSource = useMemo(
    () => sources.find((source) => source.id === sourceId) ?? sources[0] ?? null,
    [sourceId, sources],
  );
  const supportsRealMode = Boolean(selectedTemplate?.supportedModes.includes("real"));
  const templateCapabilityLabel = supportsRealMode ? "Real data available" : "Sample only";

  useEffect(() => {
    if (!selectedTemplate) return;
    if (selectedTemplate.id !== templateId) {
      setTemplateId(selectedTemplate.id);
      return;
    }

    if (dataMode === "real" && !selectedTemplate.supportedModes.includes("real")) {
      setDataMode("sample");
      return;
    }

    if (selectedScenario && selectedScenario.id !== scenarioId) {
      setScenarioId(selectedScenario.id);
    }
  }, [dataMode, scenarioId, selectedScenario, selectedTemplate, templateId]);

  useEffect(() => {
    if (dataMode !== "real" || !selectedTemplate || !supportsRealMode) {
      setSources([]);
      setSourceId("");
      setSourcesError("");
      setSourcesLoading(false);
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({ templateId: selectedTemplate.id });
    if (contextUserId) params.set("userId", contextUserId);

    setSourcesLoading(true);
    setSourcesError("");

    void fetch(`/api/admin/communications/sources?${params.toString()}`)
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { error?: string; sources?: CommunicationSource[] };
        if (!response.ok) {
          throw new Error(data.error || `Request failed: ${response.status}`);
        }
        return data.sources ?? [];
      })
      .then((nextSources) => {
        if (cancelled) return;
        setSources(nextSources);
        if (!nextSources.some((source) => source.id === sourceId)) {
          setSourceId(nextSources[0]?.id ?? "");
        }
      })
      .catch((nextError) => {
        if (cancelled) return;
        setSources([]);
        setSourceId("");
        setSourcesError(nextError instanceof Error ? nextError.message : "Failed to load real records.");
      })
      .finally(() => {
        if (!cancelled) setSourcesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contextUserId, dataMode, selectedTemplate, supportsRealMode]);

  useEffect(() => {
    if (!selectedTemplate) {
      setPreview(null);
      setLoading(false);
      return;
    }

    if (dataMode === "sample" && !selectedScenario) {
      setPreview(null);
      setLoading(false);
      return;
    }

    if (dataMode === "real" && !selectedSource) {
      setPreview(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    void postJson<{ ok: true; preview: CommunicationPreview }>("/api/admin/communications/preview", {
      templateId: selectedTemplate.id,
      mode: dataMode,
      scenarioId: dataMode === "sample" ? selectedScenario?.id : undefined,
      sourceId: dataMode === "real" ? selectedSource?.id : undefined,
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
  }, [dataMode, selectedScenario, selectedSource, selectedTemplate]);

  async function onSend() {
    if (!selectedTemplate) return;
    if (dataMode === "sample" && !selectedScenario) return;
    if (dataMode === "real" && !selectedSource) return;

    setSending(true);
    setSendError("");

    try {
      const data = await postJson<SendResult & { ok: true }>("/api/admin/communications/send", {
        templateId: selectedTemplate.id,
        mode: dataMode,
        scenarioId: dataMode === "sample" ? selectedScenario?.id : undefined,
        sourceId: dataMode === "real" ? selectedSource?.id : undefined,
      });
      setSendResult({
        to: data.to,
        subject: data.subject,
        providerMessageId: data.providerMessageId,
        notificationId: data.notificationId,
        templateId: data.templateId,
        mode: data.mode,
        scenarioId: data.scenarioId,
        sourceId: data.sourceId,
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
          {groups.find((group) => group.id === groupId)?.description ?? "Preview sample templates or build them from a specific real record."}
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

            {dataMode === "sample" ? (
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
            ) : (
              <label className="space-y-1">
                <div className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-foreground/48">Real record</div>
                <select
                  className="h-12 w-full rounded-[1rem] border border-black/8 bg-white px-4 text-sm"
                  value={selectedSource?.id ?? ""}
                  onChange={(event) => setSourceId(event.target.value)}
                  disabled={!selectedTemplate || sourcesLoading || sources.length === 0}
                >
                  {sources.length === 0 ? <option value="">{sourcesLoading ? "Loading records…" : "No eligible records"}</option> : null}
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="rounded-[1.2rem] border border-black/6 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-foreground/48">Selected email</div>
              <div
                className={cn(
                  "rounded-full border px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.14em]",
                  supportsRealMode
                    ? "border-[rgb(0_104_94_/_0.14)] bg-[rgb(230_248_244)] text-[rgb(0_104_94)]"
                    : "border-black/8 bg-[rgb(248_249_246)] text-foreground/55",
                )}
              >
                {templateCapabilityLabel}
              </div>
            </div>
            <div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">{selectedTemplate?.label ?? "No template selected"}</div>
            <div className="mt-1 text-sm leading-6 text-foreground/65">{selectedTemplate?.description ?? "Choose a template to load its preview."}</div>
            <div className="mt-3 flex flex-wrap gap-2">
      <button
                type="button"
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-medium transition",
                  dataMode === "sample"
                    ? "border-[rgb(0_104_94_/_0.18)] bg-[rgb(230_248_244)] text-[rgb(0_104_94)]"
                    : "border-black/8 bg-white text-foreground/68",
                )}
                onClick={() => setDataMode("sample")}
              >
                Sample
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-medium transition",
                  dataMode === "real"
                    ? "border-[rgb(0_104_94_/_0.18)] bg-[rgb(230_248_244)] text-[rgb(0_104_94)]"
                    : "border-black/8 bg-white text-foreground/68",
                  !supportsRealMode && "cursor-not-allowed opacity-60",
                )}
                onClick={() => supportsRealMode && setDataMode("real")}
                disabled={!supportsRealMode}
              >
                Real data
              </button>
            </div>
            <div className="mt-3 text-sm leading-6 text-foreground/62">
              {dataMode === "sample"
                ? "Sample mode uses safe fixtures so you can test layout and delivery without depending on live records."
                : "Real-data mode builds the email from a specific live record, but the test send still goes only to your admin email."}
            </div>
            {dataMode === "real" && selectedSource ? (
              <div className="mt-3 rounded-[1rem] border border-black/6 bg-[rgb(248_249_246)] px-4 py-3 text-sm text-foreground/68">
                <div className="font-medium text-foreground">{selectedSource.label}</div>
                <div className="mt-1">{selectedSource.description}</div>
                <div className="mt-1 text-[0.78rem] uppercase tracking-[0.14em] text-foreground/48">
                  {selectedSource.sourceType} • {selectedSource.id}
                </div>
              </div>
            ) : null}
            {dataMode === "real" && sourcesError ? (
              <div className="mt-3 rounded-[1rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{sourcesError}</div>
            ) : null}
            {dataMode === "real" && !sourcesError && !sourcesLoading && sources.length === 0 ? (
              <div className="mt-3 rounded-[1rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                No eligible live records are available for this template right now.
              </div>
            ) : null}
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
                <Button
                  onClick={() => void onSend()}
                  disabled={
                    sending ||
                    !selectedTemplate ||
                    (dataMode === "sample" ? !selectedScenario : !selectedSource)
                  }
                  className="h-11 rounded-full px-5"
                >
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
              Test sends only go to the signed-in admin email. Sample mode is fixture-based, and real-data mode reuses a specific live record without emailing the underlying member.
            </div>
          </div>

          {sendResult ? (
            <div className="rounded-[1.45rem] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <div className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-emerald-700">Last test send</div>
              <div className="mt-2 font-medium">{sendResult.to}</div>
              <div className="mt-1 text-emerald-800/85">Message ID: {sendResult.providerMessageId ?? "Pending"}</div>
              <div className="text-emerald-800/85">Log ID: {sendResult.notificationId ?? "Not recorded"}</div>
              <div className="text-emerald-800/85">Mode: {sendResult.mode}</div>
              {sendResult.sourceId ? <div className="text-emerald-800/85">Source: {sendResult.sourceId}</div> : null}
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
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold tracking-[-0.02em] text-foreground">{template.label}</div>
                      <div className="rounded-full border border-black/8 bg-[rgb(248_249_246)] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                        {template.supportedModes.includes("real") ? "Real" : "Sample"}
                      </div>
                    </div>
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

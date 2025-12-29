"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { IconCheck, IconDownload, IconFileText, IconUpload } from "@/components/ui/icons";
import type { DocRow } from "@/lib/doc-types";


async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const message = (data as { error?: string }).error || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return data;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function inferMimeType(file: File): string {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (name.endsWith(".doc")) return "application/msword";
  if (name.endsWith(".txt")) return "text/plain";
  if (name.endsWith(".csv")) return "text/csv";
  return "application/octet-stream";
}

function formatVisibility(value: string): string {
  switch (value) {
    case "public":
      return "Public";
    case "internal":
      return "Internal";
    case "committee_only":
      return "Committee-only";
    case "restricted":
      return "Restricted";
    default:
      return value;
  }
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".txt", ".csv"];
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
]);
const FILE_ACCEPT = ALLOWED_EXTENSIONS.join(",");

function validateUploadFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const hasAllowedExtension = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
  const mimeType = inferMimeType(file);
  const hasAllowedMime = ALLOWED_MIME_TYPES.has(mimeType);

  if (!hasAllowedExtension && !hasAllowedMime) {
    return "Unsupported file type. Use PDF, DOC, DOCX, TXT, or CSV.";
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return "File is too large. Max size is 20 MB.";
  }

  return null;
}

function uploadWithProgress(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const pct = Math.round((event.loaded / event.total) * 100);
      onProgress(pct);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(xhr.responseText || "Upload failed"));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed"));

    xhr.send(file);
  });
}

function groupDocsByVersion(docs: DocRow[]): Array<{ rootId: string; docs: DocRow[] }> {
  const groups = new Map<string, DocRow[]>();
  for (const doc of docs) {
    const rootId = doc.version_of_doc_id ?? doc.id;
    const existing = groups.get(rootId) ?? [];
    existing.push(doc);
    groups.set(rootId, existing);
  }

  const grouped = [...groups.entries()].map(([rootId, groupDocs]) => {
    const sorted = [...groupDocs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return { rootId, docs: sorted };
  });

  return grouped.sort(
    (a, b) => new Date(b.docs[0].created_at).getTime() - new Date(a.docs[0].created_at).getTime(),
  );
}

export function MeetingDocsPanel({
  meetingId,
  committeeId,
  isAdmin,
  initialDocs,
  acceptedAgendaCount,
  meetingStatus,
  onDocsChange,
}: {
  meetingId: string;
  committeeId: string | null;
  isAdmin: boolean;
  initialDocs: DocRow[];
  acceptedAgendaCount: number;
  meetingStatus: string;
  onDocsChange?: (docs: DocRow[]) => void;
}) {
  const [docs, setDocs] = useState<DocRow[]>(initialDocs);
  const [status, setStatus] = useState<string>("");
  const [minutesUploadProgress, setMinutesUploadProgress] = useState<number | null>(null);
  const [agendaUploadProgress, setAgendaUploadProgress] = useState<number | null>(null);
  const [minutesFileInputKey, setMinutesFileInputKey] = useState<number>(0);
  const [agendaFileInputKey, setAgendaFileInputKey] = useState<number>(0);
  const minutesUploading = minutesUploadProgress !== null;
  const agendaUploading = agendaUploadProgress !== null;

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [minutesTitle, setMinutesTitle] = useState<string>("");
  const [minutesDescription, setMinutesDescription] = useState<string>("");
  const [versionSourceId, setVersionSourceId] = useState<string>("");
  const [minutesMarkPosted, setMinutesMarkPosted] = useState<boolean>(true);

  const [agendaFile, setAgendaFile] = useState<File | null>(null);
  const [agendaTitle, setAgendaTitle] = useState<string>("");
  const [agendaDescription, setAgendaDescription] = useState<string>("");
  const [agendaVersionSourceId, setAgendaVersionSourceId] = useState<string>("");
  const [agendaMarkPosted, setAgendaMarkPosted] = useState<boolean>(true);
  const meetingIsCancelled = meetingStatus === "cancelled";
  const canEdit = isAdmin && !meetingIsCancelled;
  const canUploadMinutes = canEdit && !!uploadFile && minutesTitle.trim().length > 0 && !minutesUploading;
  const canUploadAgenda = canEdit && !!agendaFile && agendaTitle.trim().length > 0 && !agendaUploading;

  function clearMinutesFile() {
    setUploadFile(null);
    setMinutesFileInputKey((key) => key + 1);
  }

  function clearAgendaFile() {
    setAgendaFile(null);
    setAgendaFileInputKey((key) => key + 1);
  }

  useEffect(() => {
    onDocsChange?.(docs);
  }, [docs, onDocsChange]);

  const fallbackVisibility = committeeId ? "committee_only" : "internal";

  const minutesDocs = useMemo(() => docs.filter((d) => d.doc_type === "minutes"), [docs]);
  const agendaDocs = useMemo(() => docs.filter((d) => d.doc_type === "agenda"), [docs]);
  const minutesGroups = useMemo(() => groupDocsByVersion(minutesDocs), [minutesDocs]);
  const agendaGroups = useMemo(() => groupDocsByVersion(agendaDocs), [agendaDocs]);
  const latestAgendaDoc = agendaGroups[0]?.docs[0] ?? null;
  const canGenerateAgenda = canEdit && acceptedAgendaCount > 0;

  function confirmMarkPosted(type: "agenda" | "minutes") {
    const label = type === "agenda" ? "agenda" : "minutes";
    return confirm(`Mark ${label} as posted? This will make the document publicly available.`);
  }

  const reload = useCallback(async () => {
    const qs = new URLSearchParams({ meeting_id: meetingId });
    const { docs: nextDocs } = await fetchJson<{ docs: DocRow[] }>(`/api/docs?${qs.toString()}`);
    setDocs(nextDocs ?? []);
  }, [meetingId]);

  async function markMeetingPosted(type: "agenda" | "minutes", options?: { skipConfirm?: boolean }) {
    if (!canEdit) {
      setStatus("Meeting is cancelled. Posting updates are disabled.");
      return;
    }
    if (!options?.skipConfirm && !confirmMarkPosted(type)) return;
    const payload =
      type === "agenda"
        ? { agenda_posted_at: new Date().toISOString() }
        : { minutes_posted_at: new Date().toISOString() };
    try {
      await fetchJson(`/api/admin/meetings/${encodeURIComponent(meetingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast.success(`${type === "agenda" ? "Agenda" : "Minutes"} marked posted`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to mark posted";
      setStatus(msg);
      toast.error(msg);
    }
  }

  async function handleMinutesUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!canEdit) {
      setStatus("Meeting is cancelled. Uploads are disabled.");
      toast.error("Meeting is cancelled. Uploads are disabled.");
      return;
    }
    if (!uploadFile) {
      setStatus("Select a minutes file");
      toast.error("Select a minutes file");
      return;
    }

    const fileError = validateUploadFile(uploadFile);
    if (fileError) {
      setStatus(fileError);
      toast.error(fileError);
      return;
    }

    if (!minutesTitle.trim()) {
      setStatus("Title required");
      toast.error("Title required");
      return;
    }

    if (minutesMarkPosted && !confirmMarkPosted("minutes")) {
      return;
    }

    const contentType = inferMimeType(uploadFile);
    setStatus("Getting upload URL...");

    try {
      const { uploadUrl, path, bucket } = await fetchJson<{
        uploadUrl: string;
        token: string;
        path: string;
        bucket: string;
      }>("/api/docs/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: uploadFile.name,
          content_type: contentType,
          bucket: "documents",
        }),
      });

      setStatus("Uploading minutes...");
      setMinutesUploadProgress(0);
      await uploadWithProgress(uploadUrl, uploadFile, contentType, (pct) => setMinutesUploadProgress(pct));

      setStatus("Saving minutes...");
      await fetchJson("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: minutesTitle.trim(),
          doc_type: "minutes",
          storage_path: path,
          storage_bucket: bucket,
          mime_type: contentType || null,
          size_bytes: uploadFile.size,
          visibility: committeeId ? "committee_only" : "internal",
          committee_id: committeeId,
          meeting_id: meetingId,
          description: minutesDescription.trim() || null,
          version_of_doc_id: versionSourceId || null,
        }),
      });
      if (minutesMarkPosted) {
        await markMeetingPosted("minutes", { skipConfirm: true });
      }

      setStatus("");
      setUploadFile(null);
      setMinutesTitle("");
      setMinutesDescription("");
      setVersionSourceId("");
      setMinutesMarkPosted(true);
      await reload();
      toast.success("Minutes uploaded");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Minutes upload failed";
      setStatus(msg);
      toast.error(msg);
    } finally {
      setMinutesUploadProgress(null);
    }
  }

  async function handleAgendaUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!canEdit) {
      setStatus("Meeting is cancelled. Uploads are disabled.");
      toast.error("Meeting is cancelled. Uploads are disabled.");
      return;
    }
    if (!agendaFile) {
      setStatus("Select an agenda file");
      toast.error("Select an agenda file");
      return;
    }

    const fileError = validateUploadFile(agendaFile);
    if (fileError) {
      setStatus(fileError);
      toast.error(fileError);
      return;
    }

    if (!agendaTitle.trim()) {
      setStatus("Title required");
      toast.error("Title required");
      return;
    }

    if (agendaMarkPosted && !confirmMarkPosted("agenda")) {
      return;
    }

    const contentType = inferMimeType(agendaFile);
    setStatus("Getting upload URL...");

    try {
      const { uploadUrl, path, bucket } = await fetchJson<{
        uploadUrl: string;
        token: string;
        path: string;
        bucket: string;
      }>("/api/docs/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: agendaFile.name,
          content_type: contentType,
          bucket: "documents",
        }),
      });

      setStatus("Uploading agenda...");
      setAgendaUploadProgress(0);
      await uploadWithProgress(uploadUrl, agendaFile, contentType, (pct) => setAgendaUploadProgress(pct));

      setStatus("Saving agenda...");
      await fetchJson("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: agendaTitle.trim(),
          doc_type: "agenda",
          storage_path: path,
          storage_bucket: bucket,
          mime_type: contentType || null,
          size_bytes: agendaFile.size,
          visibility: committeeId ? "committee_only" : "internal",
          committee_id: committeeId,
          meeting_id: meetingId,
          description: agendaDescription.trim() || null,
          version_of_doc_id: agendaVersionSourceId || null,
        }),
      });
      if (agendaMarkPosted) {
        await markMeetingPosted("agenda", { skipConfirm: true });
      }

      setStatus("");
      setAgendaFile(null);
      setAgendaTitle("");
      setAgendaDescription("");
      setAgendaVersionSourceId("");
      setAgendaMarkPosted(true);
      await reload();
      toast.success("Agenda uploaded");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Agenda upload failed";
      setStatus(msg);
      toast.error(msg);
    } finally {
      setAgendaUploadProgress(null);
    }
  }

  async function handleDownload(doc: DocRow) {
    setStatus("Getting download link...");
    try {
      const { signedUrl } = await fetchJson<{ signedUrl: string | null }>(
        `/api/docs/${encodeURIComponent(doc.id)}`,
      );

      if (!signedUrl) {
        throw new Error("Could not generate download link");
      }

      window.open(signedUrl, "_blank");
      setStatus("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to download";
      setStatus(msg);
      toast.error(msg);
    }
  }

  async function handleToggleVisibility(doc: DocRow) {
    if (!canEdit) {
      setStatus("Meeting is cancelled. Updates are disabled.");
      return;
    }
    const nextVisibility = doc.visibility === "public" ? fallbackVisibility : "public";
    setStatus(`Setting visibility to ${nextVisibility}...`);
    try {
      await fetchJson(`/api/docs/${encodeURIComponent(doc.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: nextVisibility }),
      });
      setStatus("");
      await reload();
      toast.success("Visibility updated");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update visibility";
      setStatus(msg);
      toast.error(msg);
    }
  }

  async function handleGenerateAgenda() {
    if (!canEdit) {
      setStatus("Meeting is cancelled. Agenda generation is disabled.");
      return;
    }
    if (!canGenerateAgenda) {
      setStatus("Add at least one accepted agenda item before generating a PDF.");
      return;
    }
    const confirmMessage = `Generate a new agenda PDF? This will include ${acceptedAgendaCount} accepted item${
      acceptedAgendaCount === 1 ? "" : "s"
    }.`;
    if (!confirm(confirmMessage)) return;
    setStatus("Generating agenda PDF...");
    try {
      await fetchJson(`/api/meetings/${encodeURIComponent(meetingId)}/agenda-pdf`, {
        method: "POST",
      });
      setStatus("");
      await reload();
      toast.success("Agenda PDF generated");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Agenda generation failed";
      setStatus(msg);
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-6">
      {meetingIsCancelled ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          This meeting was cancelled. Agenda and minutes uploads are disabled. Reschedule the meeting and post documents on
          the replacement meeting.
        </div>
      ) : null}
      {status ? (
        <div className="text-sm text-foreground/70" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}

      <div className="rounded-lg border border-foreground/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">Minutes</div>
            <div className="text-xs text-foreground/70">Upload minutes tied to this meeting.</div>
          </div>
        </div>

        {canEdit ? (
          <details
            className="mt-4 rounded-md border border-foreground/10 bg-foreground/5 px-3 py-2"
            open={minutesDocs.length === 0}
          >
            <summary className="cursor-pointer text-sm font-medium text-foreground/80">
              Upload minutes
            </summary>
            <form onSubmit={handleMinutesUpload} className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-foreground/70">Title *</label>
                  <input
                    type="text"
                    value={minutesTitle}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setMinutesTitle(e.target.value)}
                    placeholder="Meeting minutes"
                    className="w-full rounded border border-foreground/20 bg-background px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-foreground/70">Replace version group (optional)</label>
                  <select
                    value={versionSourceId}
                    onChange={(e) => setVersionSourceId(e.target.value)}
                    className="w-full rounded border border-foreground/20 bg-background px-2 py-2 text-sm"
                  >
                    <option value="">Start a new version group</option>
                    {minutesDocs.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.title}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-xs text-foreground/60">
                    Choose a previous minutes file to keep versions together.
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-foreground/70">Description (optional)</label>
                  <textarea
                    value={minutesDescription}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMinutesDescription(e.target.value)}
                    rows={2}
                    className="w-full rounded border border-foreground/20 bg-background px-2 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-foreground/70">File *</label>
                  <input
                    key={minutesFileInputKey}
                    type="file"
                    accept={FILE_ACCEPT}
                    disabled={minutesUploading}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f) {
                        const error = validateUploadFile(f);
                        if (error) {
                          setStatus(error);
                          e.target.value = "";
                          setUploadFile(null);
                          return;
                        }
                      }
                      setUploadFile(f);
                      if (f && !minutesTitle.trim()) {
                        setMinutesTitle(f.name.replace(/\.[^.]+$/, ""));
                      }
                    }}
                    className="text-sm"
                  />
                  <div className="mt-1 text-xs text-foreground/60">PDF, DOC, DOCX, TXT, or CSV. Max 20 MB.</div>
                  {uploadFile ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground/70">
                      <span>
                        {uploadFile.name} ({formatBytes(uploadFile.size)})
                      </span>
                      <Button type="button" variant="ghost" size="sm" onClick={clearMinutesFile} disabled={minutesUploading}>
                        Clear file
                      </Button>
                    </div>
                  ) : null}
                  {minutesUploadProgress !== null ? (
                    <div className="mt-2">
                      <div className="h-2 w-full rounded bg-foreground/10">
                        <div className="h-2 rounded bg-primary" style={{ width: `${minutesUploadProgress}%` }} />
                      </div>
                      <div className="mt-1 text-xs text-foreground/70">{minutesUploadProgress}%</div>
                    </div>
                  ) : null}
                </div>
                <label
                  className="flex items-center gap-2 text-xs text-foreground/70 sm:col-span-2"
                  title="Posting minutes indicates they are publicly available."
                >
                  <input
                    type="checkbox"
                    checked={minutesMarkPosted}
                    onChange={(e) => setMinutesMarkPosted(e.target.checked)}
                  />
                  <span>Mark minutes posted now</span>
                </label>
                <div className="text-xs text-foreground/60 sm:col-span-2">
                  Posting minutes indicates they are publicly available for compliance.
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={!canUploadMinutes}>
                  {minutesUploading ? (
                    `Uploading ${minutesUploadProgress ?? 0}%`
                  ) : (
                    <>
                      <IconUpload className="h-3.5 w-3.5" />
                      Upload Minutes
                    </>
                  )}
                </Button>
              </div>
            </form>
          </details>
        ) : isAdmin ? (
          <div className="mt-4 text-sm text-foreground/70">Uploads are disabled for cancelled meetings.</div>
        ) : (
          <div className="mt-4 text-sm text-foreground/70">
            Only admins can upload minutes. Contact your committee chair or an admin for help.
          </div>
        )}

        {minutesGroups.length === 0 ? (
          <div className="mt-4 text-sm text-foreground/70">No minutes uploaded yet.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {minutesGroups.map((group) => {
              const latest = group.docs[0];
              const versionCount = group.docs.length;
              return (
                <div
                  key={group.rootId}
                  className="flex flex-wrap items-start justify-between gap-2 rounded border border-foreground/10 p-3 text-sm"
                >
                  <div className="space-y-2">
                    <div>
                      <div className="font-medium">{latest.title}</div>
                      <div className="text-xs text-foreground/70">
                        {new Date(latest.created_at).toLocaleString()} - {formatBytes(latest.size_bytes)} -{" "}
                        {formatVisibility(latest.visibility)}
                        {versionCount > 1 ? ` - ${versionCount} versions` : ""}
                      </div>
                    </div>
                    {versionCount > 1 ? (
                      <div className="space-y-1 text-xs text-foreground/70">
                        <div className="text-foreground/60">Version history</div>
                        {group.docs.map((doc, index) => (
                          <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              {index === 0 ? "Latest" : `Version ${versionCount - index}`}
                            </span>
                            <span>
                              {new Date(doc.created_at).toLocaleString()} • {formatBytes(doc.size_bytes)} • {doc.mime_type ?? "Unknown type"}
                            </span>
                            <Button type="button" variant="ghost" size="sm" onClick={() => handleDownload(doc)}>
                              <IconDownload className="h-3.5 w-3.5" />
                              Download
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleToggleVisibility(latest)}
                      >
                        {latest.visibility === "public"
                          ? `Make ${formatVisibility(fallbackVisibility)}`
                          : "Publish"}
                      </Button>
                    ) : null}
                    {canEdit ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => void markMeetingPosted("minutes")}>
                        <IconCheck className="h-3.5 w-3.5" />
                        Mark posted now
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" size="sm" onClick={() => handleDownload(latest)}>
                      <IconDownload className="h-3.5 w-3.5" />
                      Download
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-foreground/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">Agenda documents</div>
            <div className="text-xs text-foreground/70">Upload or generate agendas for public posting.</div>
            <div className="text-xs text-foreground/60">Accepted items: {acceptedAgendaCount}</div>
          </div>
          {isAdmin ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void handleGenerateAgenda()}
                disabled={!canGenerateAgenda}
                title={
                  canGenerateAgenda
                    ? "Generate agenda PDF"
                    : meetingIsCancelled
                      ? "Meeting is cancelled"
                      : "Add at least one accepted agenda item to enable PDF generation"
                }
              >
                <IconFileText className="h-3.5 w-3.5" />
                Generate Agenda PDF
              </Button>
              {latestAgendaDoc ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => handleDownload(latestAgendaDoc)}>
                  <IconDownload className="h-3.5 w-3.5" />
                  Preview latest
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {!isAdmin ? (
          <div className="mt-2 text-xs text-foreground/60">
            {acceptedAgendaCount > 0
              ? "Agenda PDF generation is restricted to admins."
              : "No accepted agenda items yet. The agenda PDF will be available once items are accepted by an admin."}
          </div>
        ) : null}
        {!canGenerateAgenda && isAdmin ? (
          <div className="mt-2 text-xs text-foreground/60">
            {meetingIsCancelled
              ? "Agenda generation is disabled for cancelled meetings."
              : "Add at least one accepted agenda item to generate the PDF."}
          </div>
        ) : null}

        {canEdit ? (
          <details
            className="mt-4 rounded-md border border-foreground/10 bg-foreground/5 px-3 py-2"
            open={agendaDocs.length === 0}
          >
            <summary className="cursor-pointer text-sm font-medium text-foreground/80">
              Upload agenda
            </summary>
            <form onSubmit={handleAgendaUpload} className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-foreground/70">Title *</label>
                  <input
                    type="text"
                    value={agendaTitle}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setAgendaTitle(e.target.value)}
                    placeholder="Meeting agenda"
                    className="w-full rounded border border-foreground/20 bg-background px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-foreground/70">Replace version group (optional)</label>
                  <select
                    value={agendaVersionSourceId}
                    onChange={(e) => setAgendaVersionSourceId(e.target.value)}
                    className="w-full rounded border border-foreground/20 bg-background px-2 py-2 text-sm"
                  >
                    <option value="">Start a new version group</option>
                    {agendaDocs.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.title}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-xs text-foreground/60">
                    Choose a previous agenda file to group versions together.
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-foreground/70">Description (optional)</label>
                  <textarea
                    value={agendaDescription}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setAgendaDescription(e.target.value)}
                    rows={2}
                    className="w-full rounded border border-foreground/20 bg-background px-2 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-foreground/70">File *</label>
                  <input
                    key={agendaFileInputKey}
                    type="file"
                    accept={FILE_ACCEPT}
                    disabled={agendaUploading}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f) {
                        const error = validateUploadFile(f);
                        if (error) {
                          setStatus(error);
                          e.target.value = "";
                          setAgendaFile(null);
                          return;
                        }
                      }
                      setAgendaFile(f);
                      if (f && !agendaTitle.trim()) {
                        setAgendaTitle(f.name.replace(/\.[^.]+$/, ""));
                      }
                    }}
                    className="text-sm"
                  />
                  <div className="mt-1 text-xs text-foreground/60">PDF, DOC, DOCX, TXT, or CSV. Max 20 MB.</div>
                  {agendaFile ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground/70">
                      <span>
                        {agendaFile.name} ({formatBytes(agendaFile.size)})
                      </span>
                      <Button type="button" variant="ghost" size="sm" onClick={clearAgendaFile} disabled={agendaUploading}>
                        Clear file
                      </Button>
                    </div>
                  ) : null}
                  {agendaUploadProgress !== null ? (
                    <div className="mt-2">
                      <div className="h-2 w-full rounded bg-foreground/10">
                        <div className="h-2 rounded bg-primary" style={{ width: `${agendaUploadProgress}%` }} />
                      </div>
                      <div className="mt-1 text-xs text-foreground/70">{agendaUploadProgress}%</div>
                    </div>
                  ) : null}
                </div>
                <label
                  className="flex items-center gap-2 text-xs text-foreground/70 sm:col-span-2"
                  title="Posting the agenda indicates it is publicly available."
                >
                  <input
                    type="checkbox"
                    checked={agendaMarkPosted}
                    onChange={(e) => setAgendaMarkPosted(e.target.checked)}
                  />
                  <span>Mark agenda posted now</span>
                </label>
                <div className="text-xs text-foreground/60 sm:col-span-2">
                  Posting the agenda indicates it is publicly available for compliance.
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={!canUploadAgenda}>
                  {agendaUploading ? (
                    `Uploading ${agendaUploadProgress ?? 0}%`
                  ) : (
                    <>
                      <IconUpload className="h-3.5 w-3.5" />
                      Upload Agenda
                    </>
                  )}
                </Button>
              </div>
            </form>
          </details>
        ) : isAdmin ? (
          <div className="mt-4 text-sm text-foreground/70">Uploads are disabled for cancelled meetings.</div>
        ) : (
          <div className="mt-4 text-sm text-foreground/70">
            Only admins can upload agenda documents. Contact your committee chair or an admin for help.
          </div>
        )}

        {agendaGroups.length === 0 ? (
          <div className="mt-4 text-sm text-foreground/70">No agenda documents yet.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {agendaGroups.map((group) => {
              const latest = group.docs[0];
              const versionCount = group.docs.length;
              return (
                <div
                  key={group.rootId}
                  className="flex flex-wrap items-start justify-between gap-2 rounded border border-foreground/10 p-3 text-sm"
                >
                  <div className="space-y-2">
                    <div>
                      <div className="font-medium">{latest.title}</div>
                      <div className="text-xs text-foreground/70">
                        {new Date(latest.created_at).toLocaleString()} - {formatBytes(latest.size_bytes)} -{" "}
                        {formatVisibility(latest.visibility)}
                        {versionCount > 1 ? ` - ${versionCount} versions` : ""}
                      </div>
                    </div>
                    {versionCount > 1 ? (
                      <div className="space-y-1 text-xs text-foreground/70">
                        <div className="text-foreground/60">Version history</div>
                        {group.docs.map((doc, index) => (
                          <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              {index === 0 ? "Latest" : `Version ${versionCount - index}`}
                            </span>
                            <span>
                              {new Date(doc.created_at).toLocaleString()} • {formatBytes(doc.size_bytes)} • {doc.mime_type ?? "Unknown type"}
                            </span>
                            <Button type="button" variant="ghost" size="sm" onClick={() => handleDownload(doc)}>
                              <IconDownload className="h-3.5 w-3.5" />
                              Download
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleToggleVisibility(latest)}
                      >
                        {latest.visibility === "public"
                          ? `Make ${formatVisibility(fallbackVisibility)}`
                          : "Publish"}
                      </Button>
                    ) : null}
                    {canEdit ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => void markMeetingPosted("agenda")}>
                        <IconCheck className="h-3.5 w-3.5" />
                        Mark posted now
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" size="sm" onClick={() => handleDownload(latest)}>
                      <IconDownload className="h-3.5 w-3.5" />
                      Download
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

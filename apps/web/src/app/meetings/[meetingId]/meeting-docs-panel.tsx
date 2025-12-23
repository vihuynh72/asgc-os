"use client";

import { useCallback, useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

type DocRow = {
  id: string;
  doc_type: string;
  title: string;
  description: string | null;
  storage_path: string | null;
  storage_bucket: string;
  mime_type: string | null;
  size_bytes: number | null;
  visibility: string;
  committee_id: string | null;
  meeting_id: string | null;
  version_of_doc_id: string | null;
  uploaded_by: string | null;
  created_at: string;
};

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

export function MeetingDocsPanel({
  meetingId,
  committeeId,
  isAdmin,
  initialDocs,
}: {
  meetingId: string;
  committeeId: string | null;
  isAdmin: boolean;
  initialDocs: DocRow[];
}) {
  const [docs, setDocs] = useState<DocRow[]>(initialDocs);
  const [status, setStatus] = useState<string>("");

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [minutesTitle, setMinutesTitle] = useState<string>("");
  const [minutesDescription, setMinutesDescription] = useState<string>("");
  const [versionSourceId, setVersionSourceId] = useState<string>("");

  const minutesDocs = useMemo(() => docs.filter((d) => d.doc_type === "minutes"), [docs]);
  const agendaDocs = useMemo(() => docs.filter((d) => d.doc_type === "agenda"), [docs]);

  const reload = useCallback(async () => {
    const qs = new URLSearchParams({ meeting_id: meetingId });
    const { docs: nextDocs } = await fetchJson<{ docs: DocRow[] }>(`/api/docs?${qs.toString()}`);
    setDocs(nextDocs ?? []);
  }, [meetingId]);

  async function handleMinutesUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!uploadFile) {
      setStatus("Select a minutes file");
      return;
    }

    if (!minutesTitle.trim()) {
      setStatus("Title required");
      return;
    }

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
          content_type: uploadFile.type,
          bucket: "minutes",
        }),
      });

      setStatus("Uploading minutes...");
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": uploadFile.type || "application/octet-stream" },
        body: uploadFile,
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload minutes");
      }

      setStatus("Saving minutes...");
      await fetchJson("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: minutesTitle.trim(),
          doc_type: "minutes",
          storage_path: path,
          storage_bucket: bucket,
          mime_type: uploadFile.type || null,
          size_bytes: uploadFile.size,
          visibility: committeeId ? "committee_only" : "internal",
          committee_id: committeeId,
          meeting_id: meetingId,
          description: minutesDescription.trim() || null,
          version_of_doc_id: versionSourceId || null,
        }),
      });

      setStatus("");
      setUploadFile(null);
      setMinutesTitle("");
      setMinutesDescription("");
      setVersionSourceId("");
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Minutes upload failed");
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
      setStatus(err instanceof Error ? err.message : "Failed to download");
    }
  }

  async function handleGenerateAgenda() {
    if (!confirm("Generate a new agenda PDF?")) return;
    setStatus("Generating agenda PDF...");
    try {
      await fetchJson(`/api/meetings/${encodeURIComponent(meetingId)}/agenda-pdf`, {
        method: "POST",
      });
      setStatus("");
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Agenda generation failed");
    }
  }

  return (
    <div className="space-y-6">
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

        <form onSubmit={handleMinutesUpload} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-foreground/70">Title *</label>
              <input
                type="text"
                value={minutesTitle}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setMinutesTitle(e.target.value)}
                placeholder="Meeting minutes"
                className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-foreground/70">Replace version (optional)</label>
              <select
                value={versionSourceId}
                onChange={(e) => setVersionSourceId(e.target.value)}
                className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
              >
                <option value="">New version group</option>
                {minutesDocs.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-foreground/70">Description (optional)</label>
              <textarea
                value={minutesDescription}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMinutesDescription(e.target.value)}
                rows={2}
                className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-foreground/70">File *</label>
              <input
                type="file"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const f = e.target.files?.[0] ?? null;
                  setUploadFile(f);
                  if (f && !minutesTitle.trim()) {
                    setMinutesTitle(f.name.replace(/\.[^.]+$/, ""));
                  }
                }}
                className="text-sm"
              />
              {uploadFile ? (
                <div className="mt-1 text-xs text-foreground/70">
                  {uploadFile.name} ({formatBytes(uploadFile.size)})
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm">
              Upload Minutes
            </Button>
          </div>
        </form>

        {minutesDocs.length === 0 ? (
          <div className="mt-4 text-sm text-foreground/70">No minutes uploaded yet.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {minutesDocs.map((doc) => (
              <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-foreground/10 p-3 text-sm">
                <div>
                  <div className="font-medium">{doc.title}</div>
                  <div className="text-xs text-foreground/70">
                    {new Date(doc.created_at).toLocaleString()} - {formatBytes(doc.size_bytes)}
                    {doc.version_of_doc_id ? " - Versioned" : ""}
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => handleDownload(doc)}>
                  Download
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-foreground/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">Agenda PDF</div>
            <div className="text-xs text-foreground/70">Generate a simple agenda PDF from accepted items.</div>
          </div>
          {isAdmin ? (
            <Button type="button" size="sm" onClick={() => void handleGenerateAgenda()}>
              Generate Agenda PDF
            </Button>
          ) : null}
        </div>

        {agendaDocs.length === 0 ? (
          <div className="mt-4 text-sm text-foreground/70">No agenda PDFs generated yet.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {agendaDocs.map((doc) => (
              <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-foreground/10 p-3 text-sm">
                <div>
                  <div className="font-medium">{doc.title}</div>
                  <div className="text-xs text-foreground/70">
                    {new Date(doc.created_at).toLocaleString()} - {formatBytes(doc.size_bytes)}
                    {doc.version_of_doc_id ? " - Versioned" : ""}
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => handleDownload(doc)}>
                  Download
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

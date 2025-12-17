"use client";

import { useCallback, useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

type DocRow = {
  id: string;
  doc_type: string;
  title: string;
  description: string | null;
  storage_path: string;
  storage_bucket: string;
  mime_type: string | null;
  size_bytes: number | null;
  visibility: string;
  committee_id: string | null;
  meeting_id: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

type CommitteeRow = {
  id: string;
  committee_key: string;
  name: string;
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
  if (bytes == null || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDocType(type: string): string {
  switch (type) {
    case "minutes":
      return "Minutes";
    case "agenda":
      return "Agenda";
    case "budget":
      return "Budget";
    case "receipt":
      return "Receipt";
    case "report":
      return "Report";
    case "policy":
      return "Policy";
    case "form":
      return "Form";
    case "other":
      return "Other";
    default:
      return type;
  }
}

function formatVisibility(visibility: string): string {
  switch (visibility) {
    case "public":
      return "Public";
    case "internal":
      return "Internal";
    case "restricted":
      return "Restricted";
    case "committee_only":
      return "Committee Only";
    default:
      return visibility;
  }
}

export function DocsPanel({
  initialDocs,
  committees,
}: {
  initialDocs: DocRow[];
  committees: CommitteeRow[];
}) {
  const [docs, setDocs] = useState<DocRow[]>(initialDocs);
  const [status, setStatus] = useState<string>("");

  // Filters
  const [filterDocType, setFilterDocType] = useState<string>("");
  const [filterVisibility, setFilterVisibility] = useState<string>("");
  const [filterCommittee, setFilterCommittee] = useState<string>("");

  // Upload state
  const [showUploadForm, setShowUploadForm] = useState<boolean>(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [newTitle, setNewTitle] = useState<string>("");
  const [newDocType, setNewDocType] = useState<string>("other");
  const [newDescription, setNewDescription] = useState<string>("");
  const [newVisibility, setNewVisibility] = useState<string>("internal");
  const [newCommitteeId, setNewCommitteeId] = useState<string>("");

  const committeesById = useMemo(() => {
    const m = new Map<string, CommitteeRow>();
    for (const c of committees) m.set(c.id, c);
    return m;
  }, [committees]);

  const filteredDocs = useMemo(() => {
    return docs.filter((d) => {
      if (filterDocType && d.doc_type !== filterDocType) return false;
      if (filterVisibility && d.visibility !== filterVisibility) return false;
      if (filterCommittee && d.committee_id !== filterCommittee) return false;
      return true;
    });
  }, [docs, filterDocType, filterVisibility, filterCommittee]);

  const reload = useCallback(async () => {
    const qs = new URLSearchParams();
    if (filterDocType) qs.set("doc_type", filterDocType);
    if (filterVisibility) qs.set("visibility", filterVisibility);
    if (filterCommittee) qs.set("committee_id", filterCommittee);

    const { docs: d } = await fetchJson<{ docs: DocRow[] }>(`/api/docs?${qs.toString()}`);
    setDocs(d);
  }, [filterDocType, filterVisibility, filterCommittee]);

  async function handleUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!uploadFile) {
      setStatus("No file selected");
      return;
    }

    if (!newTitle.trim()) {
      setStatus("Title required");
      return;
    }

    setStatus("Getting upload URL...");

    try {
      // Get signed upload URL
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
          bucket: "documents",
        }),
      });

      setStatus("Uploading file...");

      // Upload to storage
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": uploadFile.type || "application/octet-stream" },
        body: uploadFile,
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload file to storage");
      }

      setStatus("Creating doc record...");

      // Create doc record
      await fetchJson("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          doc_type: newDocType,
          storage_path: path,
          storage_bucket: bucket,
          mime_type: uploadFile.type || null,
          size_bytes: uploadFile.size,
          visibility: newVisibility,
          committee_id: newCommitteeId || null,
          description: newDescription.trim() || null,
        }),
      });

      setStatus("Done!");
      setUploadFile(null);
      setNewTitle("");
      setNewDocType("other");
      setNewDescription("");
      setNewVisibility("internal");
      setNewCommitteeId("");
      setShowUploadForm(false);
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload failed");
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

      // Open in new tab
      window.open(signedUrl, "_blank");
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to get download link");
    }
  }

  async function handleDelete(doc: DocRow) {
    if (!confirm(`Delete "${doc.title}"?`)) return;

    setStatus("Deleting...");
    try {
      await fetchJson(`/api/docs/${encodeURIComponent(doc.id)}`, { method: "DELETE" });
      setStatus("");
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-4">
      {status ? <div className="text-sm text-foreground/70">{status}</div> : null}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterDocType}
          onChange={(e) => setFilterDocType(e.target.value)}
          className="rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
        >
          <option value="">All Types</option>
          <option value="minutes">Minutes</option>
          <option value="agenda">Agenda</option>
          <option value="budget">Budget</option>
          <option value="receipt">Receipt</option>
          <option value="report">Report</option>
          <option value="policy">Policy</option>
          <option value="form">Form</option>
          <option value="other">Other</option>
        </select>

        <select
          value={filterVisibility}
          onChange={(e) => setFilterVisibility(e.target.value)}
          className="rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
        >
          <option value="">All Visibility</option>
          <option value="public">Public</option>
          <option value="internal">Internal</option>
          <option value="restricted">Restricted</option>
          <option value="committee_only">Committee Only</option>
        </select>

        <select
          value={filterCommittee}
          onChange={(e) => setFilterCommittee(e.target.value)}
          className="rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
        >
          <option value="">All Committees</option>
          {committees.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setFilterDocType("");
            setFilterVisibility("");
            setFilterCommittee("");
          }}
        >
          Clear Filters
        </Button>

        <div className="flex-1" />

        <Button type="button" size="sm" onClick={() => setShowUploadForm(!showUploadForm)}>
          {showUploadForm ? "Cancel" : "Upload Document"}
        </Button>
      </div>

      {/* Upload form */}
      {showUploadForm ? (
        <form onSubmit={handleUpload} className="space-y-3 rounded-lg border border-foreground/10 p-4">
          <div className="text-sm font-medium">Upload New Document</div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-foreground/70">Title *</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewTitle(e.target.value)}
                placeholder="Document title"
                className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-foreground/70">Type</label>
              <select
                value={newDocType}
                onChange={(e) => setNewDocType(e.target.value)}
                className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
              >
                <option value="minutes">Minutes</option>
                <option value="agenda">Agenda</option>
                <option value="budget">Budget</option>
                <option value="receipt">Receipt</option>
                <option value="report">Report</option>
                <option value="policy">Policy</option>
                <option value="form">Form</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-foreground/70">Visibility</label>
              <select
                value={newVisibility}
                onChange={(e) => setNewVisibility(e.target.value)}
                className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
              >
                <option value="public">Public</option>
                <option value="internal">Internal</option>
                <option value="restricted">Restricted</option>
                <option value="committee_only">Committee Only</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-foreground/70">Committee (optional)</label>
              <select
                value={newCommitteeId}
                onChange={(e) => setNewCommitteeId(e.target.value)}
                className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
              >
                <option value="">None</option>
                {committees.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-foreground/70">Description (optional)</label>
              <textarea
                value={newDescription}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNewDescription(e.target.value)}
                placeholder="Brief description..."
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
                  if (f && !newTitle.trim()) {
                    setNewTitle(f.name.replace(/\.[^.]+$/, ""));
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
              Upload
            </Button>
          </div>
        </form>
      ) : null}

      {/* Docs list */}
      {filteredDocs.length === 0 ? (
        <div className="text-sm text-foreground/70">No documents found.</div>
      ) : (
        <div className="space-y-3">
          {filteredDocs.map((doc) => (
            <div key={doc.id} className="rounded-lg border border-foreground/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="font-medium">{doc.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground/70">
                    <span className="rounded bg-foreground/5 px-1.5 py-0.5">
                      {formatDocType(doc.doc_type)}
                    </span>
                    <span className="rounded bg-foreground/5 px-1.5 py-0.5">
                      {formatVisibility(doc.visibility)}
                    </span>
                    {doc.committee_id && committeesById.has(doc.committee_id) ? (
                      <span className="rounded bg-foreground/5 px-1.5 py-0.5">
                        {committeesById.get(doc.committee_id)?.name}
                      </span>
                    ) : null}
                    <span>{formatBytes(doc.size_bytes)}</span>
                  </div>
                  {doc.description ? (
                    <div className="mt-2 text-sm text-foreground/80">{doc.description}</div>
                  ) : null}
                </div>

                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => handleDownload(doc)}>
                    Download
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(doc)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

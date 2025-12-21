"use client";

import { useCallback, useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

type DocRow = {
  id: string;
  doc_type: string;
  title: string;
  description: string | null;
  content_text: string | null;
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
  updated_at: string;
};

type CommitteeRow = {
  id: string;
  committee_key: string;
  name: string;
};

type DocSummary = {
  id: string;
  doc_id: string;
  summary_text: string;
  status: string;
  created_at: string;
};

type SuggestedTask = {
  id: string;
  source_doc_id: string;
  proposed_title: string;
  proposed_description: string | null;
  status: string;
  created_at: string;
  published_task_id: string | null;
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
    case "committee_notes":
      return "Committee Notes";
    case "attachment":
      return "Attachment";
    case "receipt":
      return "Receipt";
    case "report":
      return "Report";
    case "constitution":
      return "Constitution";
    case "policy":
      return "Policy";
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
  const [newContentText, setNewContentText] = useState<string>("");

  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [summariesByDocId, setSummariesByDocId] = useState<Record<string, DocSummary[]>>({});
  const [suggestedByDocId, setSuggestedByDocId] = useState<Record<string, SuggestedTask[]>>({});
  const [noteBusyId, setNoteBusyId] = useState<string | null>(null);

  const committeesById = useMemo(() => {
    const m = new Map<string, CommitteeRow>();
    for (const c of committees) m.set(c.id, c);
    return m;
  }, [committees]);

  const isCommitteeNote = newDocType === "committee_notes";

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

    if (!newTitle.trim()) {
      setStatus("Title required");
      return;
    }

    const isCommitteeNote = newDocType === "committee_notes";

    if (isCommitteeNote) {
      if (!newCommitteeId) {
        setStatus("Committee required for committee notes");
        return;
      }

      if (!newContentText.trim()) {
        setStatus("Note content required");
        return;
      }

      setStatus("Creating note...");
      try {
        await fetchJson("/api/docs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: newTitle.trim(),
            doc_type: "committee_notes",
            visibility: "committee_only",
            committee_id: newCommitteeId,
            description: newDescription.trim() || null,
            content_text: newContentText.trim(),
          }),
        });

        setStatus("Done!");
        setUploadFile(null);
        setNewTitle("");
        setNewDocType("other");
        setNewDescription("");
        setNewVisibility("internal");
        setNewCommitteeId("");
        setNewContentText("");
        setShowUploadForm(false);
        await reload();
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Note creation failed");
      }

      return;
    }

    if (!uploadFile) {
      setStatus("No file selected");
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
      setNewContentText("");
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

  async function loadNoteDetails(docId: string) {
    const [summariesRes, suggestedRes] = await Promise.all([
      fetchJson<{ summaries: DocSummary[] }>(`/api/docs/${encodeURIComponent(docId)}/summaries`),
      fetchJson<{ suggestedTasks: SuggestedTask[] }>(
        `/api/docs/${encodeURIComponent(docId)}/suggested-tasks`,
      ),
    ]);

    setSummariesByDocId((prev) => ({ ...prev, [docId]: summariesRes.summaries ?? [] }));
    setSuggestedByDocId((prev) => ({ ...prev, [docId]: suggestedRes.suggestedTasks ?? [] }));
  }

  async function toggleNote(doc: DocRow) {
    if (expandedNoteId === doc.id) {
      setExpandedNoteId(null);
      return;
    }

    setExpandedNoteId(doc.id);
    if (!summariesByDocId[doc.id] || !suggestedByDocId[doc.id]) {
      setStatus("Loading note details...");
      try {
        await loadNoteDetails(doc.id);
        setStatus("");
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Failed to load note details");
      }
    }
  }

  async function handleSummarize(docId: string) {
    setNoteBusyId(docId);
    setStatus("Generating summary...");
    try {
      const { summary } = await fetchJson<{ summary: DocSummary }>(
        `/api/docs/${encodeURIComponent(docId)}/summaries`,
        { method: "POST" },
      );
      setSummariesByDocId((prev) => ({
        ...prev,
        [docId]: summary ? [summary, ...(prev[docId] ?? [])] : prev[docId] ?? [],
      }));
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Summary failed");
    } finally {
      setNoteBusyId(null);
    }
  }

  async function handleExtractTasks(docId: string) {
    const summaries = summariesByDocId[docId] ?? [];
    const latestSummary = summaries[0];
    if (!latestSummary) {
      setStatus("Generate a summary first");
      return;
    }

    setNoteBusyId(docId);
    setStatus("Extracting action items...");
    try {
      const { suggestedTasks } = await fetchJson<{ suggestedTasks: SuggestedTask[] }>(
        `/api/docs/${encodeURIComponent(docId)}/suggested-tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ summary_id: latestSummary.id }),
        },
      );
      setSuggestedByDocId((prev) => ({ ...prev, [docId]: suggestedTasks ?? [] }));
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Task extraction failed");
    } finally {
      setNoteBusyId(null);
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
          <option value="committee_notes">Committee Notes</option>
          <option value="attachment">Attachment</option>
          <option value="receipt">Receipt</option>
          <option value="report">Report</option>
          <option value="constitution">Constitution</option>
          <option value="policy">Policy</option>
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
                onChange={(e) => {
                  const value = e.target.value;
                  setNewDocType(value);
                  if (value === "committee_notes") {
                    setNewVisibility("committee_only");
                    if (!newCommitteeId && committees[0]?.id) {
                      setNewCommitteeId(committees[0].id);
                    }
                  } else if (newVisibility === "committee_only") {
                    setNewVisibility("internal");
                    setNewContentText("");
                  }
                }}
                className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
              >
                <option value="minutes">Minutes</option>
                <option value="agenda">Agenda</option>
                <option value="committee_notes">Committee Notes</option>
                <option value="attachment">Attachment</option>
                <option value="receipt">Receipt</option>
                <option value="report">Report</option>
                <option value="constitution">Constitution</option>
                <option value="policy">Policy</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-foreground/70">Visibility</label>
              <select
                value={isCommitteeNote ? "committee_only" : newVisibility}
                onChange={(e) => setNewVisibility(e.target.value)}
                disabled={isCommitteeNote}
                className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
              >
                {isCommitteeNote ? (
                  <option value="committee_only">Committee Only</option>
                ) : (
                  <>
                    <option value="public">Public</option>
                    <option value="internal">Internal</option>
                    <option value="restricted">Restricted</option>
                    <option value="committee_only">Committee Only</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-foreground/70">
                Committee {isCommitteeNote ? "*" : "(optional)"}
              </label>
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

            {isCommitteeNote ? (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-foreground/70">Note *</label>
                <textarea
                  value={newContentText}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNewContentText(e.target.value)}
                  placeholder="Write the committee note..."
                  rows={5}
                  className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
                />
              </div>
            ) : (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-foreground/70">File *</label>
                <input
                  type="file"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const f = e.target.files?.[0] ?? null;
                    setUploadFile(f);
                    if (f && !newTitle.trim()) {
                      setNewTitle(f.name.replace(/\\.[^.]+$/, ""));
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
            )}
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
          {filteredDocs.map((doc) => {
            const isNote = doc.doc_type === "committee_notes";
            const isExpanded = expandedNoteId === doc.id;
            const summaries = summariesByDocId[doc.id] ?? [];
            const latestSummary = summaries[0] ?? null;
            const suggestedTasks = suggestedByDocId[doc.id] ?? [];
            const isBusy = noteBusyId === doc.id;

            return (
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

                    {isNote && isExpanded ? (
                      <div className="mt-4 space-y-4 rounded-lg bg-foreground/5 p-4 text-sm">
                        <div>
                          <div className="text-xs font-medium text-foreground/70">Note</div>
                          <div className="mt-2 whitespace-pre-wrap">
                            {doc.content_text ?? "No content."}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-medium text-foreground/70">AI Summary</div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleSummarize(doc.id)}
                              disabled={isBusy}
                            >
                              Generate
                            </Button>
                          </div>
                          {latestSummary ? (
                            <div className="mt-2 whitespace-pre-wrap">{latestSummary.summary_text}</div>
                          ) : (
                            <div className="mt-2 text-xs text-foreground/60">No summary yet.</div>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-medium text-foreground/70">Suggested Tasks</div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleExtractTasks(doc.id)}
                              disabled={isBusy || !latestSummary}
                            >
                              Extract
                            </Button>
                          </div>
                          {suggestedTasks.length === 0 ? (
                            <div className="mt-2 text-xs text-foreground/60">No suggested tasks yet.</div>
                          ) : (
                            <div className="mt-2 space-y-2">
                              {suggestedTasks.map((task) => (
                                <div key={task.id} className="rounded border border-foreground/10 p-2">
                                  <div className="text-sm font-medium">{task.proposed_title}</div>
                                  {task.proposed_description ? (
                                    <div className="mt-1 text-xs text-foreground/70">
                                      {task.proposed_description}
                                    </div>
                                  ) : null}
                                  <div className="mt-1 text-[11px] text-foreground/60">
                                    Status: {task.status}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex gap-2">
                    {isNote ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleNote(doc)}
                      >
                        {isExpanded ? "Hide" : "View"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(doc)}
                      >
                        Download
                      </Button>
                    )}
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
            );
          })}
        </div>
      )}
    </div>
  );
}

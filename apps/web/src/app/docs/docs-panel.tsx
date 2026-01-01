"use client";

import { useCallback, useId, useMemo, useState, type ChangeEvent, type FormEvent } from "react";

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

type MeetingRow = {
  id: string;
  title: string;
  starts_at: string;
  committee_id: string | null;
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

type UploadBucket = "documents" | "minutes" | "receipts";

const BUCKET_CONFIG: Record<UploadBucket, { maxBytes: number; allowedMimeTypes: string[] }> = {
  documents: {
    maxBytes: 50 * 1024 * 1024,
    allowedMimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.oasis.opendocument.text",
      "application/rtf",
      "text/rtf",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/png",
      "image/jpeg",
      "image/gif",
      "text/plain",
    ],
  },
  minutes: {
    maxBytes: 50 * 1024 * 1024,
    allowedMimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.oasis.opendocument.text",
      "application/rtf",
      "text/rtf",
    ],
  },
  receipts: {
    maxBytes: 10 * 1024 * 1024,
    allowedMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
  },
};

function bucketForDocType(docType: string): UploadBucket {
  if (docType === "minutes") return "minutes";
  if (docType === "receipt") return "receipts";
  return "documents";
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
    case "grant_application":
      return "Grant Application";
    case "report":
      return "Report";
    case "finance_export":
      return "Finance Export";
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

function formatDocErrorMessage(message: string): string {
  switch (message) {
    case "forbidden":
      return "You do not have permission to update this document. Contact your committee chair or an admin.";
    case "doc_not_found":
      return "Document not found.";
    case "doc_deleted":
      return "Document has been deleted.";
    case "cannot_change_committee":
      return "Committee cannot be changed for committee notes.";
    case "cannot_change_meeting":
      return "Meeting cannot be changed for agenda or minutes.";
    case "committee_only_required":
      return "Committee notes must remain committee-only.";
    case "content_text_required":
      return "Note content is required.";
    case "content_text_not_allowed":
      return "Note content is only allowed for committee notes.";
    case "forbidden_visibility":
      return "You do not have permission to set restricted visibility.";
    default:
      return message;
  }
}

export function DocsPanel({
  initialDocs,
  committees,
  meetings,
  canUseRestricted,
}: {
  initialDocs: DocRow[];
  committees: CommitteeRow[];
  meetings: MeetingRow[];
  canUseRestricted: boolean;
}) {
  const [docs, setDocs] = useState<DocRow[]>(initialDocs);
  const [status, setStatus] = useState<string>("");

  // Filters
  const [filterDocType, setFilterDocType] = useState<string>("");
  const [filterVisibility, setFilterVisibility] = useState<string>("");
  const [filterCommittee, setFilterCommittee] = useState<string>("");
  const [filterMeeting, setFilterMeeting] = useState<string>("");
  const [filterQuery, setFilterQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [docPage, setDocPage] = useState<number>(1);
  const [docPageSize, setDocPageSize] = useState<number>(10);

  // Upload state
  const [showUploadForm, setShowUploadForm] = useState<boolean>(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>("");
  const [newDocType, setNewDocType] = useState<string>("other");
  const [newDescription, setNewDescription] = useState<string>("");
  const [newVisibility, setNewVisibility] = useState<string>("internal");
  const [newCommitteeId, setNewCommitteeId] = useState<string>("");
  const [newMeetingId, setNewMeetingId] = useState<string>("");
  const [newContentText, setNewContentText] = useState<string>("");

  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    title: string;
    description: string;
    visibility: string;
    committeeId: string;
    contentText: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [summariesByDocId, setSummariesByDocId] = useState<Record<string, DocSummary[]>>({});
  const [suggestedByDocId, setSuggestedByDocId] = useState<Record<string, SuggestedTask[]>>({});
  const [noteBusyId, setNoteBusyId] = useState<string | null>(null);

  const committeesById = useMemo(() => {
    const m = new Map<string, CommitteeRow>();
    for (const c of committees) m.set(c.id, c);
    return m;
  }, [committees]);

  const meetingsById = useMemo(() => {
    const m = new Map<string, MeetingRow>();
    for (const meeting of meetings) m.set(meeting.id, meeting);
    return m;
  }, [meetings]);

  const isCommitteeNote = newDocType === "committee_notes";
  const isMeetingDoc = newDocType === "minutes" || newDocType === "agenda";
  const uploadBucket = bucketForDocType(newDocType);
  const uploadConfig = BUCKET_CONFIG[uploadBucket];
  const fileAcceptList = uploadConfig.allowedMimeTypes.join(",");
  const fileInputId = useId();
  const selectedMeeting = useMemo(
    () => (isMeetingDoc ? meetingsById.get(newMeetingId) ?? null : null),
    [isMeetingDoc, meetingsById, newMeetingId],
  );
  const meetingCommitteeId = selectedMeeting?.committee_id ?? null;
  const committeeSelectValue =
    isMeetingDoc && meetingCommitteeId ? meetingCommitteeId : newCommitteeId;

  function resetUploadDraft() {
    setUploadFile(null);
    setNewTitle("");
    setNewDocType("other");
    setNewDescription("");
    setNewVisibility("internal");
    setNewCommitteeId("");
    setNewMeetingId("");
    setNewContentText("");
    setShowUploadForm(false);
  }

  function startEditing(doc: DocRow) {
    setEditingDocId(doc.id);
    setEditDraft({
      title: doc.title ?? "",
      description: doc.description ?? "",
      visibility: doc.visibility ?? "internal",
      committeeId: doc.committee_id ?? "",
      contentText: doc.content_text ?? "",
    });
  }

  function cancelEditing() {
    setEditingDocId(null);
    setEditDraft(null);
  }

  async function handleSave(doc: DocRow) {
    if (!editDraft || isSaving) return;
    const trimmedTitle = editDraft.title.trim();
    if (!trimmedTitle) {
      setStatus("Title required");
      return;
    }

    const isNote = doc.doc_type === "committee_notes";
    const isMeetingDoc = doc.doc_type === "minutes" || doc.doc_type === "agenda";

    if (isNote && !editDraft.contentText.trim()) {
      setStatus("Note content required");
      return;
    }

    const nextVisibility = isNote ? "committee_only" : editDraft.visibility;
    const nextCommitteeId = isNote ? doc.committee_id ?? "" : editDraft.committeeId;

    if (nextVisibility === "committee_only" && !nextCommitteeId) {
      setStatus("Committee required for committee-only visibility");
      return;
    }

    const payload: {
      title: string;
      description: string | null;
      visibility: string;
      committee_id?: string | null;
      content_text?: string;
    } = {
      title: trimmedTitle,
      description: editDraft.description.trim() || null,
      visibility: nextVisibility,
    };

    if (!isNote && !isMeetingDoc) {
      payload.committee_id = editDraft.committeeId || null;
    }

    if (isNote) {
      payload.content_text = editDraft.contentText.trim();
    }

    setIsSaving(true);
    setStatus("Saving...");
    try {
      const { doc: updated } = await fetchJson<{ doc: DocRow }>(
        `/api/docs/${encodeURIComponent(doc.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      setDocs((prev) => prev.map((d) => (d.id === doc.id ? updated : d)));
      setStatus("Saved");
      cancelEditing();
    } catch (err) {
      setStatus(err instanceof Error ? formatDocErrorMessage(err.message) : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  function handleFileSelected(file: File | null) {
    setUploadFile(file);
    if (!file) return;
    setNewTitle((prev) => (prev.trim() ? prev : file.name.replace(/\.[^.]+$/, "")));
  }

  function openUploadForm() {
    setStatus("");
    setShowUploadForm(true);
  }

  const filteredDocs = useMemo(() => {
    const query = filterQuery.trim().toLowerCase();
    return docs.filter((d) => {
      if (filterDocType && d.doc_type !== filterDocType) return false;
      if (filterVisibility && d.visibility !== filterVisibility) return false;
      if (filterCommittee && d.committee_id !== filterCommittee) return false;
      if (filterMeeting && d.meeting_id !== filterMeeting) return false;
      if (query) {
        const committeeName = d.committee_id ? committeesById.get(d.committee_id)?.name ?? "" : "";
        const meetingTitle = d.meeting_id ? meetingsById.get(d.meeting_id)?.title ?? "" : "";
        const haystack = [
          d.title,
          d.description ?? "",
          d.doc_type,
          formatDocType(d.doc_type),
          committeeName,
          meetingTitle,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [
    committeesById,
    docs,
    filterCommittee,
    filterDocType,
    filterMeeting,
    filterQuery,
    filterVisibility,
    meetingsById,
  ]);

  const sortedDocs = useMemo(() => {
    const items = [...filteredDocs];
    switch (sortBy) {
      case "oldest":
        items.sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
        break;
      case "title":
        items.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "newest":
      default:
        items.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        break;
    }
    return items;
  }, [filteredDocs, sortBy]);

  const pageCount = Math.max(1, Math.ceil(sortedDocs.length / docPageSize));
  const resolvedDocPage = Math.min(docPage, pageCount);
  const paginatedDocs = useMemo(() => {
    const start = (resolvedDocPage - 1) * docPageSize;
    return sortedDocs.slice(start, start + docPageSize);
  }, [docPageSize, resolvedDocPage, sortedDocs]);

  const reload = useCallback(async () => {
    const qs = new URLSearchParams();
    if (filterDocType) qs.set("doc_type", filterDocType);
    if (filterVisibility) qs.set("visibility", filterVisibility);
    if (filterCommittee) qs.set("committee_id", filterCommittee);
    if (filterMeeting) qs.set("meeting_id", filterMeeting);

    const { docs: d } = await fetchJson<{ docs: DocRow[] }>(`/api/docs?${qs.toString()}`);
    setDocs(d);
  }, [filterDocType, filterVisibility, filterCommittee, filterMeeting]);

  async function handleUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isUploading) return;
    setStatus("");

    if (!newTitle.trim()) {
      setStatus("Title required");
      return;
    }

    const isCommitteeNote = newDocType === "committee_notes";
    const isMeetingDoc = newDocType === "minutes" || newDocType === "agenda";
    const selectedMeeting = isMeetingDoc ? meetingsById.get(newMeetingId) ?? null : null;
    const meetingCommitteeId = selectedMeeting?.committee_id ?? null;

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
      setIsUploading(true);
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
        resetUploadDraft();
        await reload();
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Note creation failed");
      } finally {
        setIsUploading(false);
      }

      return;
    }

    if (!uploadFile) {
      setStatus("No file selected");
      return;
    }

    if (isMeetingDoc) {
      if (!newMeetingId) {
        setStatus("Meeting required for minutes/agenda");
        return;
      }
      if (!selectedMeeting) {
        setStatus("Select a valid meeting");
        return;
      }
    }

    if (uploadFile.size > uploadConfig.maxBytes) {
      setStatus(`File too large (max ${formatBytes(uploadConfig.maxBytes)})`);
      return;
    }

    if (uploadFile.type && !uploadConfig.allowedMimeTypes.includes(uploadFile.type)) {
      setStatus("Unsupported file type for this document type");
      return;
    }

    const effectiveCommitteeId =
      isMeetingDoc && meetingCommitteeId ? meetingCommitteeId : newCommitteeId || null;
    const effectiveVisibility =
      isMeetingDoc && meetingCommitteeId ? "committee_only" : newVisibility;

    if (effectiveVisibility === "committee_only" && !effectiveCommitteeId) {
      setStatus("Committee required for committee-only visibility");
      return;
    }

    setStatus("Getting upload URL...");
    setIsUploading(true);
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
          bucket: uploadBucket,
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
          visibility: effectiveVisibility,
          committee_id: effectiveCommitteeId,
          meeting_id: isMeetingDoc ? newMeetingId : null,
          description: newDescription.trim() || null,
        }),
      });

      setStatus("Done!");
      resetUploadDraft();
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
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

  async function handleCopy(text: string, label: string) {
    if (!text) {
      setStatus(`No ${label.toLowerCase()} to copy`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`${label} copied`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : `Failed to copy ${label.toLowerCase()}`);
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
      {status ? (
        <div className="text-sm text-foreground/70" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={filterQuery}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setFilterQuery(e.target.value);
            setDocPage(1);
          }}
          className="w-56 rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          placeholder="Search docs…"
          aria-label="Search documents"
        />

        <select
          value={filterDocType}
          onChange={(e) => {
            setFilterDocType(e.target.value);
            setDocPage(1);
          }}
          className="rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
        >
          <option value="">All Types</option>
          <option value="minutes">Minutes</option>
          <option value="agenda">Agenda</option>
          <option value="committee_notes">Committee Notes</option>
          <option value="attachment">Attachment</option>
          <option value="receipt">Receipt</option>
          <option value="grant_application">Grant Application</option>
          <option value="report">Report</option>
          <option value="constitution">Constitution</option>
          <option value="policy">Policy</option>
          <option value="finance_export">Finance Export</option>
          <option value="other">Other</option>
        </select>

        <select
          value={filterVisibility}
          onChange={(e) => {
            setFilterVisibility(e.target.value);
            setDocPage(1);
          }}
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
          onChange={(e) => {
            setFilterCommittee(e.target.value);
            setDocPage(1);
          }}
          className="rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
        >
          <option value="">All Committees</option>
          {committees.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={filterMeeting}
          onChange={(e) => {
            setFilterMeeting(e.target.value);
            setDocPage(1);
          }}
          className="rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
        >
          <option value="">All Meetings</option>
          {meetings.map((meeting) => (
            <option key={meeting.id} value={meeting.id}>
              {new Date(meeting.starts_at).toLocaleDateString()} - {meeting.title}
            </option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value);
            setDocPage(1);
          }}
          className="rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          aria-label="Sort documents"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="title">Title (A-Z)</option>
        </select>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setFilterQuery("");
            setFilterDocType("");
            setFilterVisibility("");
            setFilterCommittee("");
            setFilterMeeting("");
            setDocPage(1);
          }}
          disabled={!filterQuery && !filterDocType && !filterVisibility && !filterCommittee && !filterMeeting}
        >
          Clear Filters
        </Button>

        <div className="flex-1" />

        <Button
          type="button"
          size="sm"
          onClick={() => {
            if (showUploadForm) {
              setStatus("");
              resetUploadDraft();
            } else {
              openUploadForm();
            }
          }}
          disabled={isUploading}
        >
          {showUploadForm ? "Cancel" : "Upload Document"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/60">
        <span>
          Showing {paginatedDocs.length} of {filteredDocs.length} filtered ({docs.length} total)
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            <span>Rows</span>
            <select
              className="h-8 rounded border border-foreground/20 bg-background px-2 text-xs"
              value={docPageSize}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                setDocPageSize(Number(e.target.value));
                setDocPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </label>
          <span>
            Page {resolvedDocPage} of {pageCount}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDocPage(Math.max(1, resolvedDocPage - 1))}
            disabled={resolvedDocPage <= 1}
          >
            Prev
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDocPage(Math.min(pageCount, resolvedDocPage + 1))}
            disabled={resolvedDocPage >= pageCount}
          >
            Next
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void reload()}>
            Refresh list
          </Button>
        </div>
      </div>

      {/* Upload form */}
      {showUploadForm ? (
        <form
          onSubmit={handleUpload}
          className="space-y-3 rounded-lg border border-foreground/10 p-4"
          aria-busy={isUploading}
        >
          <div className="text-sm font-medium">Upload New Document</div>

          <fieldset disabled={isUploading} className="space-y-3">
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
                      setUploadFile(null);
                      setNewMeetingId("");
                    } else if (newVisibility === "committee_only") {
                      setNewVisibility("internal");
                      setNewContentText("");
                    }
                    if (value !== "minutes" && value !== "agenda") {
                      setNewMeetingId("");
                    } else if (!newMeetingId && meetings[0]?.id) {
                      setNewMeetingId(meetings[0].id);
                    }
                  }}
                  className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
                >
                  <option value="minutes">Minutes</option>
                  <option value="agenda">Agenda</option>
                  <option value="committee_notes">Committee Notes</option>
                  <option value="attachment">Attachment</option>
                  <option value="receipt">Receipt</option>
                  <option value="grant_application">Grant Application</option>
                  <option value="report">Report</option>
                  <option value="constitution">Constitution</option>
                  <option value="policy">Policy</option>
                  <option value="other">Other</option>
                </select>
              </div>

            {isMeetingDoc ? (
              <div>
                <label className="mb-1 block text-xs text-foreground/70">Meeting *</label>
                <select
                  value={newMeetingId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewMeetingId(value);
                    const meeting = meetingsById.get(value) ?? null;
                    if (meeting?.committee_id) {
                      setNewCommitteeId(meeting.committee_id);
                      setNewVisibility("committee_only");
                    } else if (newVisibility === "committee_only") {
                      setNewCommitteeId("");
                      setNewVisibility("internal");
                    }
                  }}
                  className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
                >
                  <option value="">Select meeting</option>
                  {meetings.map((meeting) => (
                    <option key={meeting.id} value={meeting.id}>
                      {new Date(meeting.starts_at).toLocaleString()} - {meeting.title}
                    </option>
                  ))}
                </select>
                {selectedMeeting ? (
                  <div className="mt-1 text-xs text-foreground/60">
                    {selectedMeeting.committee_id ? "Committee meeting" : "General meeting"}
                  </div>
                ) : null}
              </div>
            ) : null}

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
                    {canUseRestricted ? <option value="restricted">Restricted</option> : null}
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
                value={committeeSelectValue}
                onChange={(e) => setNewCommitteeId(e.target.value)}
                disabled={isMeetingDoc && !!meetingCommitteeId}
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
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    id={fileInputId}
                    type="file"
                    accept={fileAcceptList}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const f = e.target.files?.[0] ?? null;
                      handleFileSelected(f);
                      e.currentTarget.value = "";
                    }}
                    className="sr-only"
                  />
                  <label
                    htmlFor={fileInputId}
                    className="inline-flex cursor-pointer items-center rounded border border-foreground/20 px-3 py-1 text-sm text-foreground hover:bg-foreground/5"
                  >
                    Choose file
                  </label>
                  <div className="text-xs text-foreground/70">
                    {uploadFile ? `${uploadFile.name} (${formatBytes(uploadFile.size)})` : "No file selected"}
                  </div>
                </div>
                <div className="mt-1 text-xs text-foreground/60">
                  Max size {formatBytes(uploadConfig.maxBytes)}. Allowed: {uploadConfig.allowedMimeTypes.join(", ")}.
                </div>
              </div>
            )}
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={isUploading}>
                {isUploading ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </fieldset>
        </form>
      ) : null}

      {/* Docs list */}
      {filteredDocs.length === 0 ? (
        <div className="text-sm text-foreground/70">
          {docs.length === 0 ? "No documents found." : "No documents match the current filters."}
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedDocs.map((doc) => {
            const isNote = doc.doc_type === "committee_notes";
            const isMeetingDoc = doc.doc_type === "minutes" || doc.doc_type === "agenda";
            const isExpanded = expandedNoteId === doc.id;
            const summaries = summariesByDocId[doc.id] ?? [];
            const latestSummary = summaries[0] ?? null;
            const suggestedTasks = suggestedByDocId[doc.id] ?? [];
            const isBusy = noteBusyId === doc.id;
            const isEditing = editingDocId === doc.id;
            const edit = isEditing ? editDraft : null;

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
                      {doc.meeting_id && meetingsById.has(doc.meeting_id) ? (
                        <span className="rounded bg-foreground/5 px-1.5 py-0.5">
                          {meetingsById.get(doc.meeting_id)?.title}
                        </span>
                      ) : null}
                      <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                      <span>{formatBytes(doc.size_bytes)}</span>
                    </div>
                    {doc.description ? (
                      <div className="mt-2 text-sm text-foreground/80">{doc.description}</div>
                    ) : null}

                    {isEditing && edit ? (
                      <div className="mt-3 space-y-3 rounded-lg border border-foreground/10 bg-foreground/5 p-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs text-foreground/70">Title *</label>
                            <input
                              type="text"
                              value={edit.title}
                              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                setEditDraft((prev) => (prev ? { ...prev, title: e.target.value } : prev))
                              }
                              className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-xs text-foreground/70">Visibility</label>
                            <select
                              value={isNote ? "committee_only" : edit.visibility}
                              onChange={(e) =>
                                setEditDraft((prev) =>
                                  prev ? { ...prev, visibility: e.target.value } : prev,
                                )
                              }
                              disabled={isNote}
                              className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
                            >
                              {isNote ? (
                                <option value="committee_only">Committee Only</option>
                              ) : (
                                <>
                                  <option value="public">Public</option>
                                  <option value="internal">Internal</option>
                                  {canUseRestricted || edit.visibility === "restricted" ? (
                                    <option value="restricted">Restricted</option>
                                  ) : null}
                                  <option value="committee_only">Committee Only</option>
                                </>
                              )}
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-xs text-foreground/70">
                              Committee {isNote ? "*" : "(optional)"}
                            </label>
                            <select
                              value={edit.committeeId}
                              onChange={(e) =>
                                setEditDraft((prev) =>
                                  prev ? { ...prev, committeeId: e.target.value } : prev,
                                )
                              }
                              disabled={isNote || isMeetingDoc}
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
                            <label className="mb-1 block text-xs text-foreground/70">
                              Description (optional)
                            </label>
                            <textarea
                              value={edit.description}
                              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                                setEditDraft((prev) =>
                                  prev ? { ...prev, description: e.target.value } : prev,
                                )
                              }
                              rows={2}
                              className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
                            />
                          </div>

                          {isNote ? (
                            <div className="sm:col-span-2">
                              <label className="mb-1 block text-xs text-foreground/70">Note *</label>
                              <textarea
                                value={edit.contentText}
                                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                                  setEditDraft((prev) =>
                                    prev ? { ...prev, contentText: e.target.value } : prev,
                                  )
                                }
                                rows={5}
                                className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
                              />
                            </div>
                          ) : null}
                        </div>

                        {isMeetingDoc ? (
                          <div className="text-xs text-foreground/60">
                            Meeting-linked docs cannot change committee or meeting.
                          </div>
                        ) : null}

                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={cancelEditing}
                            disabled={isSaving}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleSave(doc)}
                            disabled={isSaving}
                          >
                            {isSaving ? "Saving..." : "Save"}
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {isNote && isExpanded ? (
                      <div className="mt-4 space-y-4 rounded-lg bg-foreground/5 p-4 text-sm">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-medium text-foreground/70">Note</div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void handleCopy(doc.content_text ?? "", "Note")}
                            >
                              Copy
                            </Button>
                          </div>
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

                  <div className="flex flex-wrap gap-2">
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
                      onClick={() => void handleCopy(doc.id, "Document ID")}
                    >
                      Copy ID
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => startEditing(doc)}
                      disabled={isEditing || isSaving}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(doc)}
                      disabled={isSaving}
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

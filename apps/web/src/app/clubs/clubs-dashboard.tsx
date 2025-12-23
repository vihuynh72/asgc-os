"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

import { ELIGIBILITY_REASON_LABELS, fetchJson, formatDateTime, normalizeEligibilityReasons } from "./clubs-utils";

type ClubRow = {
  id: string;
  name: string;
  status: "pending" | "chartered" | "suspended" | "revoked" | "inactive";
  advisor_name: string | null;
  advisor_email: string | null;
  constitution_doc_id: string | null;
  members_count: number;
  benefit_card_count: number;
  last_charter_at: string | null;
  charter_term_id: string | null;
  status_reason: string | null;
  created_at: string;
  updated_at: string;
};

type ChecklistItemRow = {
  item_key: string;
  label: string;
  description: string | null;
  is_required: boolean;
  sort_order: number;
  source_reference: string | null;
};

type ChecklistStatusRow = {
  club_id: string;
  item_key: string;
  status: "pending" | "submitted" | "complete" | "waived";
  checked_at: string | null;
  checked_by: string | null;
  notes: string | null;
};

type ClubEligibilityRow = {
  club_id: string;
  term_id: string | null;
  members_count: number;
  benefit_card_count: number;
  required_benefit_cards: number;
  meets_min_members: boolean;
  meets_benefit_cards: boolean;
  charter_complete: boolean;
  charter_status_ok: boolean;
  constitution_on_file: boolean;
  eligible_for_funding: boolean;
  reasons: unknown;
  updated_at: string;
};

type AbsenceSummaryRow = {
  club_id: string;
  term_id: string | null;
  unexcused_absences: number;
  excused_absences: number;
  present_count: number;
  absence_flag: "ok" | "warning" | "suspended" | "revoked";
  not_counted_for_quorum: boolean;
};

type ClubDraft = {
  name: string;
  status: ClubRow["status"];
  advisor_name: string;
  advisor_email: string;
  members_count: string;
  benefit_card_count: string;
  status_reason: string;
};

const STATUS_OPTIONS: ClubRow["status"][] = ["pending", "chartered", "suspended", "revoked", "inactive"];

function parseNonNegativeInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function draftFromClub(club: ClubRow): ClubDraft {
  return {
    name: club.name,
    status: club.status,
    advisor_name: club.advisor_name ?? "",
    advisor_email: club.advisor_email ?? "",
    members_count: String(club.members_count ?? 0),
    benefit_card_count: String(club.benefit_card_count ?? 0),
    status_reason: club.status_reason ?? "",
  };
}

export function ClubsDashboard({
  initialClubs,
  initialChecklistItems,
  initialChecklist,
  initialEligibility,
  initialAbsenceSummary,
  isAdmin,
}: {
  initialClubs: ClubRow[];
  initialChecklistItems: ChecklistItemRow[];
  initialChecklist: ChecklistStatusRow[];
  initialEligibility: ClubEligibilityRow[];
  initialAbsenceSummary: AbsenceSummaryRow[];
  isAdmin: boolean;
}) {
  const [clubs, setClubs] = useState<ClubRow[]>(initialClubs);
  const [checklistItems, setChecklistItems] = useState<ChecklistItemRow[]>(initialChecklistItems);
  const [checklist, setChecklist] = useState<ChecklistStatusRow[]>(initialChecklist);
  const [eligibility, setEligibility] = useState<ClubEligibilityRow[]>(initialEligibility);
  const [absenceSummary, setAbsenceSummary] = useState<AbsenceSummaryRow[]>(initialAbsenceSummary);
  const [drafts, setDrafts] = useState<Record<string, ClubDraft>>({});
  const [status, setStatus] = useState<string>("");
  const [clubSearch, setClubSearch] = useState<string>("");
  const [clubStatusFilter, setClubStatusFilter] = useState<ClubRow["status"] | "">("");
  const [newClubName, setNewClubName] = useState<string>("");
  const [newClubAdvisor, setNewClubAdvisor] = useState<string>("");
  const [newClubAdvisorEmail, setNewClubAdvisorEmail] = useState<string>("");
  const [newClubMembers, setNewClubMembers] = useState<string>("0");
  const [newClubBenefitCards, setNewClubBenefitCards] = useState<string>("0");
  const [newClubStatus, setNewClubStatus] = useState<ClubRow["status"]>("pending");
  const [uploadFiles, setUploadFiles] = useState<Record<string, File | null>>({});

  const checklistByClub = useMemo(() => {
    const map = new Map<string, Map<string, ChecklistStatusRow>>();
    for (const entry of checklist) {
      if (!map.has(entry.club_id)) {
        map.set(entry.club_id, new Map());
      }
      map.get(entry.club_id)?.set(entry.item_key, entry);
    }
    return map;
  }, [checklist]);

  const eligibilityByClub = useMemo(() => {
    const map = new Map<string, ClubEligibilityRow>();
    for (const row of eligibility) {
      map.set(row.club_id, row);
    }
    return map;
  }, [eligibility]);

  const absenceByClub = useMemo(() => {
    const map = new Map<string, AbsenceSummaryRow>();
    for (const row of absenceSummary) {
      map.set(row.club_id, row);
    }
    return map;
  }, [absenceSummary]);

  const filteredClubs = useMemo(() => {
    const query = clubSearch.trim().toLowerCase();
    return clubs.filter((club) => {
      if (clubStatusFilter && club.status !== clubStatusFilter) return false;
      if (!query) return true;
      const haystack = [
        club.name,
        club.status,
        club.advisor_name ?? "",
        club.advisor_email ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [clubSearch, clubStatusFilter, clubs]);

  async function reload() {
    const data = await fetchJson<{
      clubs: ClubRow[];
      checklistItems: ChecklistItemRow[];
      checklist: ChecklistStatusRow[];
      eligibility: ClubEligibilityRow[];
      absenceSummary: AbsenceSummaryRow[];
    }>("/api/clubs");

    setClubs(data.clubs ?? []);
    setChecklistItems(data.checklistItems ?? []);
    setChecklist(data.checklist ?? []);
    setEligibility(data.eligibility ?? []);
    setAbsenceSummary(data.absenceSummary ?? []);
    setDrafts({});
  }

  async function onCreateClub(event: FormEvent) {
    event.preventDefault();
    if (!newClubName.trim()) return;
    const membersCount = parseNonNegativeInt(newClubMembers);
    if (membersCount === null) {
      setStatus("Members count must be 0 or higher.");
      return;
    }
    const benefitCount = parseNonNegativeInt(newClubBenefitCards);
    if (benefitCount === null) {
      setStatus("Benefit card count must be 0 or higher.");
      return;
    }

    setStatus("Creating club...");

    try {
      await fetchJson("/api/clubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newClubName.trim(),
          status: newClubStatus,
          advisor_name: newClubAdvisor.trim() || undefined,
          advisor_email: newClubAdvisorEmail.trim() || undefined,
          members_count: membersCount,
          benefit_card_count: benefitCount,
        }),
      });
      setNewClubName("");
      setNewClubAdvisor("");
      setNewClubAdvisorEmail("");
      setNewClubMembers("0");
      setNewClubBenefitCards("0");
      setNewClubStatus("pending");
      await reload();
      setStatus("Club created.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to create club");
    }
  }

  function updateDraft(clubId: string, patch: Partial<ClubDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [clubId]: {
        ...(prev[clubId] ?? draftFromClub(clubs.find((c) => c.id === clubId)!)),
        ...patch,
      },
    }));
  }

  async function saveClub(club: ClubRow) {
    const draft = drafts[club.id] ?? draftFromClub(club);
    const membersCount = parseNonNegativeInt(draft.members_count);
    if (membersCount === null) {
      setStatus("Members count must be 0 or higher.");
      return;
    }
    const benefitCount = parseNonNegativeInt(draft.benefit_card_count);
    if (benefitCount === null) {
      setStatus("Benefit card count must be 0 or higher.");
      return;
    }

    setStatus("Saving club...");

    try {
      await fetchJson(`/api/clubs/${encodeURIComponent(club.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          status: draft.status,
          advisor_name: draft.advisor_name.trim() || null,
          advisor_email: draft.advisor_email.trim() || null,
          members_count: membersCount,
          benefit_card_count: benefitCount,
          status_reason: draft.status_reason.trim() || null,
        }),
      });
      await reload();
      setStatus("Saved.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save club");
    }
  }

  async function updateChecklistItem(clubId: string, itemKey: string, statusValue: ChecklistStatusRow["status"]) {
    if (!isAdmin) return;
    setStatus("Updating checklist...");

    try {
      const { checklist: updated } = await fetchJson<{ checklist: ChecklistStatusRow }>("/api/clubs/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, itemKey, status: statusValue }),
      });

      setChecklist((prev) => {
        const next = prev.filter((entry) => !(entry.club_id === clubId && entry.item_key === itemKey));
        next.push(updated);
        return next;
      });

      await reload();
      setStatus("Checklist updated.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to update checklist");
    }
  }

  async function uploadConstitution(club: ClubRow) {
    const file = uploadFiles[club.id];
    if (!file) {
      setStatus("Select a file first.");
      return;
    }

    setStatus("Uploading constitution...");

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
          filename: file.name,
          content_type: file.type,
          bucket: "documents",
        }),
      });

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload file to storage");
      }

      const { doc } = await fetchJson<{ doc: { id: string } }>("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${club.name} Constitution`,
          doc_type: "constitution",
          storage_path: path,
          storage_bucket: bucket,
          mime_type: file.type || null,
          size_bytes: file.size,
          visibility: "internal",
          description: "Club constitution",
        }),
      });

      await fetchJson(`/api/clubs/${encodeURIComponent(club.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ constitution_doc_id: doc.id }),
      });

      setUploadFiles((prev) => ({ ...prev, [club.id]: null }));
      await reload();
      setStatus("Constitution uploaded.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to upload constitution");
    }
  }

  function renderEligibility(row?: ClubEligibilityRow | null) {
    if (!row) return "-";
    if (row.eligible_for_funding) return "Eligible";
    const reasons = normalizeEligibilityReasons(row.reasons);
    if (reasons.length === 0) return "Not eligible";
    return reasons.map((reason) => ELIGIBILITY_REASON_LABELS[reason] ?? reason).join("; ");
  }

  function renderAbsence(row?: AbsenceSummaryRow | null) {
    if (!row) return "-";
    return `${row.unexcused_absences} unexcused, ${row.excused_absences} excused (${row.absence_flag})`;
  }

  return (
    <div className="space-y-8">
      {status ? (
        <div className="text-sm text-foreground/70" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}

      <div className="rounded-lg border p-4">
        <div className="text-sm font-medium">Find clubs</div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Search</div>
            <input
              className="h-9 w-64 rounded border px-3 py-2 text-sm"
              placeholder="Name, advisor, status…"
              value={clubSearch}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setClubSearch(event.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Status</div>
            <select
              className="h-9 rounded border px-3 py-2 text-sm"
              value={clubStatusFilter}
              onChange={(event) => setClubStatusFilter(event.target.value as ClubRow["status"] | "")}
            >
              <option value="">All</option>
              {STATUS_OPTIONS.map((statusOption) => (
                <option key={statusOption} value={statusOption}>
                  {statusOption}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setClubSearch("");
              setClubStatusFilter("");
            }}
            disabled={!clubSearch && !clubStatusFilter}
          >
            Clear
          </Button>
        </div>
        <div className="mt-2 text-xs text-foreground/60">
          Showing {filteredClubs.length} of {clubs.length} clubs
        </div>
      </div>

      {isAdmin ? (
        <form onSubmit={onCreateClub} className="rounded-lg border p-4">
          <div className="text-sm font-medium">Create club</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              className="rounded border px-3 py-2 text-sm"
              placeholder="Club name"
              aria-label="Club name"
              value={newClubName}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setNewClubName(event.target.value)}
            />
            <select
              className="rounded border px-3 py-2 text-sm"
              aria-label="Club status"
              value={newClubStatus}
              onChange={(event) => setNewClubStatus(event.target.value as ClubRow["status"])}
            >
              {STATUS_OPTIONS.map((statusOption) => (
                <option key={statusOption} value={statusOption}>
                  {statusOption}
                </option>
              ))}
            </select>
            <input
              className="rounded border px-3 py-2 text-sm"
              placeholder="Advisor name"
              aria-label="Advisor name"
              value={newClubAdvisor}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setNewClubAdvisor(event.target.value)}
            />
            <input
              className="rounded border px-3 py-2 text-sm"
              placeholder="Advisor email"
              aria-label="Advisor email"
              type="email"
              value={newClubAdvisorEmail}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setNewClubAdvisorEmail(event.target.value)}
            />
            <input
              className="rounded border px-3 py-2 text-sm"
              placeholder="Members count"
              aria-label="Members count"
              type="number"
              min={0}
              step={1}
              value={newClubMembers}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setNewClubMembers(event.target.value)}
            />
            <input
              className="rounded border px-3 py-2 text-sm"
              placeholder="Benefit card count"
              aria-label="Benefit card count"
              type="number"
              min={0}
              step={1}
              value={newClubBenefitCards}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setNewClubBenefitCards(event.target.value)}
            />
          </div>
          <div className="mt-4">
            <Button type="submit" disabled={!newClubName.trim()}>
              Create club
            </Button>
          </div>
        </form>
      ) : null}

      <div className="space-y-4">
        {filteredClubs.length === 0 ? (
          <div className="text-sm text-foreground/70">
            {clubs.length === 0 ? "No clubs yet." : "No clubs match the current filters."}
          </div>
        ) : (
          filteredClubs.map((club) => {
            const draft = drafts[club.id] ?? draftFromClub(club);
            const clubChecklist = checklistByClub.get(club.id);
            const eligibilityRow = eligibilityByClub.get(club.id);
            const absenceRow = absenceByClub.get(club.id);

            return (
              <div key={club.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold">{club.name}</div>
                    <div className="text-xs text-foreground/60">
                      Last updated {formatDateTime(club.updated_at)}
                    </div>
                  </div>
                  {isAdmin ? (
                    <Button variant="outline" size="sm" onClick={() => void saveClub(club)}>
                      Save changes
                    </Button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <div className="text-sm font-medium">Club details</div>
                    <div className="grid gap-2">
                      <input
                        className="rounded border px-3 py-2 text-sm"
                        value={draft.name}
                        onChange={(event) => updateDraft(club.id, { name: event.target.value })}
                        disabled={!isAdmin}
                      />
                      <select
                        className="rounded border px-3 py-2 text-sm"
                        aria-label="Club status"
                        value={draft.status}
                        onChange={(event) =>
                          updateDraft(club.id, { status: event.target.value as ClubRow["status"] })
                        }
                        disabled={!isAdmin}
                      >
                        {STATUS_OPTIONS.map((statusOption) => (
                          <option key={statusOption} value={statusOption}>
                            {statusOption}
                          </option>
                        ))}
                      </select>
                      <input
                        className="rounded border px-3 py-2 text-sm"
                        placeholder="Advisor name"
                        aria-label="Advisor name"
                        value={draft.advisor_name}
                        onChange={(event) => updateDraft(club.id, { advisor_name: event.target.value })}
                        disabled={!isAdmin}
                      />
                      <input
                        className="rounded border px-3 py-2 text-sm"
                        placeholder="Advisor email"
                        aria-label="Advisor email"
                        type="email"
                        value={draft.advisor_email}
                        onChange={(event) => updateDraft(club.id, { advisor_email: event.target.value })}
                        disabled={!isAdmin}
                      />
                      <input
                        className="rounded border px-3 py-2 text-sm"
                        placeholder="Members count"
                        aria-label="Members count"
                        type="number"
                        min={0}
                        step={1}
                        value={draft.members_count}
                        onChange={(event) => updateDraft(club.id, { members_count: event.target.value })}
                        disabled={!isAdmin}
                      />
                      <input
                        className="rounded border px-3 py-2 text-sm"
                        placeholder="Benefit card count"
                        aria-label="Benefit card count"
                        type="number"
                        min={0}
                        step={1}
                        value={draft.benefit_card_count}
                        onChange={(event) => updateDraft(club.id, { benefit_card_count: event.target.value })}
                        disabled={!isAdmin}
                      />
                      <input
                        className="rounded border px-3 py-2 text-sm"
                        placeholder="Status reason"
                        aria-label="Status reason"
                        value={draft.status_reason}
                        onChange={(event) => updateDraft(club.id, { status_reason: event.target.value })}
                        disabled={!isAdmin}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-sm font-medium">Charter + eligibility</div>
                    <div className="text-sm text-foreground/70">
                      Eligibility: {renderEligibility(eligibilityRow)}
                    </div>
                    <div className="text-sm text-foreground/70">
                      Absences: {renderAbsence(absenceRow)}
                    </div>
                    <div className="text-sm text-foreground/70">
                      Constitution doc: {club.constitution_doc_id ?? "-"}
                    </div>
                    {isAdmin ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="file"
                          className="text-sm"
                          aria-label="Constitution file"
                          onChange={(event) =>
                            setUploadFiles((prev) => ({
                              ...prev,
                              [club.id]: event.target.files?.[0] ?? null,
                            }))
                          }
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void uploadConstitution(club)}
                          disabled={!uploadFiles[club.id]}
                        >
                          Upload constitution
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-sm font-medium">Charter checklist</div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {checklistItems.map((item) => {
                      const entry = clubChecklist?.get(item.item_key);
                      const statusValue = entry?.status ?? "pending";
                      return (
                        <div key={item.item_key} className="rounded border p-2 text-sm">
                          <div className="font-medium">{item.label}</div>
                          {item.description ? (
                            <div className="text-xs text-foreground/70">{item.description}</div>
                          ) : null}
                          <div className="mt-2 flex items-center gap-2">
                            <select
                              className="rounded border px-2 py-1 text-xs"
                              value={statusValue}
                              onChange={(event) =>
                                void updateChecklistItem(
                                  club.id,
                                  item.item_key,
                                  event.target.value as ChecklistStatusRow["status"],
                                )
                              }
                              disabled={!isAdmin}
                            >
                              <option value="pending">pending</option>
                              <option value="submitted">submitted</option>
                              <option value="complete">complete</option>
                              <option value="waived">waived</option>
                            </select>
                            <span className="text-xs text-foreground/60">{item.source_reference ?? ""}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

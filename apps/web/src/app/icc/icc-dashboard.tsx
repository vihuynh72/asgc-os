"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

import { fetchJson, formatDateTime, toIsoFromDatetimeLocal } from "./icc-utils";

type QuorumSummary = {
  meeting_id: string;
  member_count: number;
  excused_count: number;
  eligible_count: number;
  present_count: number;
  quorum_required: number;
  advisor_present: boolean;
  quorum_met: boolean;
};

type IccMeeting = {
  id: string;
  term_id: string | null;
  starts_at: string;
  location: string | null;
  called_to_order_at: string | null;
  advisor_present: boolean;
  status: "scheduled" | "cancelled" | "completed";
  notes: string | null;
  created_at: string;
  updated_at: string;
  quorum: QuorumSummary | null;
};

type ClubRow = {
  id: string;
  name: string;
  status: "pending" | "chartered" | "suspended" | "revoked" | "inactive";
};

type AttendanceRow = {
  id: string;
  club_id: string;
  status: "present" | "absent" | "excused";
  present_at_call_to_order: boolean;
  excused_reason: string | null;
  notes: string | null;
  updated_at: string;
};

type MeetingDraft = {
  location: string;
  status: IccMeeting["status"];
  advisor_present: boolean;
  called_to_order_at: string;
};

type AttendanceDraft = {
  status: AttendanceRow["status"];
  excused_reason: string;
  notes: string;
};

function datetimeLocalFromIso(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function meetingStatusBadge(status: IccMeeting["status"]): string {
  switch (status) {
    case "cancelled":
      return "bg-red-500/10 text-red-600";
    case "completed":
      return "bg-emerald-500/10 text-emerald-600";
    case "scheduled":
    default:
      return "bg-blue-500/10 text-blue-600";
  }
}

function meetingStatusLabel(status: IccMeeting["status"]): string {
  switch (status) {
    case "cancelled":
      return "Cancelled";
    case "completed":
      return "Completed";
    case "scheduled":
    default:
      return "Scheduled";
  }
}

export function IccDashboard({
  initialMeetings,
  initialClubs,
  isAdmin,
}: {
  initialMeetings: IccMeeting[];
  initialClubs: ClubRow[];
  isAdmin: boolean;
}) {
  const [meetings, setMeetings] = useState<IccMeeting[]>(initialMeetings);
  const [clubs, setClubs] = useState<ClubRow[]>(initialClubs);
  const [status, setStatus] = useState<string>("");
  const [newMeetingStartsAt, setNewMeetingStartsAt] = useState<string>("");
  const [newMeetingLocation, setNewMeetingLocation] = useState<string>("");
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>(initialMeetings[0]?.id ?? "");
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [meetingDrafts, setMeetingDrafts] = useState<Record<string, MeetingDraft>>({});
  const [attendanceDrafts, setAttendanceDrafts] = useState<Record<string, AttendanceDraft>>({});
  const [meetingSearch, setMeetingSearch] = useState<string>("");
  const [meetingStatusFilter, setMeetingStatusFilter] = useState<IccMeeting["status"] | "">("");
  const [meetingSort, setMeetingSort] = useState<"newest" | "oldest">("newest");
  const [attendanceQuery, setAttendanceQuery] = useState<string>("");
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState<AttendanceRow["status"] | "">("");
  const [clubStatusFilter, setClubStatusFilter] = useState<ClubRow["status"] | "">("");
  const [attendanceSort, setAttendanceSort] = useState<"name" | "status">("name");
  const [attendancePage, setAttendancePage] = useState<number>(1);
  const [attendancePageSize, setAttendancePageSize] = useState<number>(25);
  const [isSavingAttendance, setIsSavingAttendance] = useState<boolean>(false);
  const attendanceSectionRef = useRef<HTMLDivElement>(null);

  const attendanceByClubId = useMemo(() => {
    const map = new Map<string, AttendanceRow>();
    for (const row of attendance) {
      map.set(row.club_id, row);
    }
    return map;
  }, [attendance]);

  const meetingCounts = useMemo(() => {
    const counts = { scheduled: 0, cancelled: 0, completed: 0 };
    for (const meeting of meetings) {
      counts[meeting.status] += 1;
    }
    return counts;
  }, [meetings]);

  const filteredMeetings = useMemo(() => {
    const query = meetingSearch.trim().toLowerCase();
    let next = meetings;

    if (meetingStatusFilter) {
      next = next.filter((meeting) => meeting.status === meetingStatusFilter);
    }

    if (query) {
      next = next.filter((meeting) => {
        const haystack = [
          meeting.location ?? "",
          meeting.notes ?? "",
          formatDateTime(meeting.starts_at),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
    }

    const sorted = [...next];
    sorted.sort((a, b) => {
      const aTime = new Date(a.starts_at).getTime();
      const bTime = new Date(b.starts_at).getTime();
      return meetingSort === "oldest" ? aTime - bTime : bTime - aTime;
    });
    return sorted;
  }, [meetingSearch, meetingSort, meetingStatusFilter, meetings]);

  const resolveAttendanceDraft = useCallback(
    (clubId: string): AttendanceDraft => {
      const existing = attendanceByClubId.get(clubId);
      const base: AttendanceDraft = {
        status: existing?.status ?? "absent",
        excused_reason: existing?.excused_reason ?? "",
        notes: existing?.notes ?? "",
      };
      return attendanceDrafts[clubId] ?? base;
    },
    [attendanceByClubId, attendanceDrafts],
  );

  const hasAttendanceChanges = useCallback(
    (clubId: string): boolean => {
      const draft = attendanceDrafts[clubId];
      if (!draft) return false;
      const existing = attendanceByClubId.get(clubId);
      const baseStatus = existing?.status ?? "absent";
      const baseReason = existing?.excused_reason ?? "";
      const baseNotes = existing?.notes ?? "";
      return (
        draft.status !== baseStatus ||
        draft.excused_reason.trim() !== baseReason ||
        draft.notes.trim() !== baseNotes
      );
    },
    [attendanceByClubId, attendanceDrafts],
  );

  const filteredClubs = useMemo(() => {
    const query = attendanceQuery.trim().toLowerCase();
    let next = clubs;

    if (attendanceStatusFilter) {
      next = next.filter((club) => resolveAttendanceDraft(club.id).status === attendanceStatusFilter);
    }

    if (clubStatusFilter) {
      next = next.filter((club) => club.status === clubStatusFilter);
    }

    if (query) {
      next = next.filter((club) => club.name.toLowerCase().includes(query));
    }

    const sorted = [...next];
    if (attendanceSort === "status") {
      const order: Record<AttendanceRow["status"], number> = {
        present: 0,
        excused: 1,
        absent: 2,
      };
      sorted.sort((a, b) => {
        const statusA = resolveAttendanceDraft(a.id).status;
        const statusB = resolveAttendanceDraft(b.id).status;
        if (statusA !== statusB) return order[statusA] - order[statusB];
        return a.name.localeCompare(b.name);
      });
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }

    return sorted;
  }, [
    attendanceQuery,
    attendanceSort,
    attendanceStatusFilter,
    clubStatusFilter,
    clubs,
    resolveAttendanceDraft,
  ]);

  const attendanceSummary = useMemo(() => {
    const counts = { present: 0, excused: 0, absent: 0 };
    for (const club of filteredClubs) {
      const status = resolveAttendanceDraft(club.id).status;
      counts[status] += 1;
    }
    return counts;
  }, [filteredClubs, resolveAttendanceDraft]);

  const dirtyAttendanceCount = useMemo(
    () => clubs.filter((club) => hasAttendanceChanges(club.id)).length,
    [clubs, hasAttendanceChanges],
  );

  const attendancePageCount = Math.max(1, Math.ceil(filteredClubs.length / attendancePageSize));
  const resolvedAttendancePage = Math.min(attendancePage, attendancePageCount);
  const paginatedClubs = useMemo(() => {
    const start = (resolvedAttendancePage - 1) * attendancePageSize;
    return filteredClubs.slice(start, start + attendancePageSize);
  }, [attendancePageSize, filteredClubs, resolvedAttendancePage]);

  async function reloadMeetings() {
    const data = await fetchJson<{ meetings: IccMeeting[] }>("/api/icc/meetings");
    setMeetings(data.meetings ?? []);
  }

  async function loadAttendance(meetingId: string) {
    if (!meetingId) return;
    setStatus("Loading attendance...");
    try {
      const data = await fetchJson<{ attendance: AttendanceRow[]; clubs: ClubRow[] }>(
        `/api/icc/meetings/${encodeURIComponent(meetingId)}/attendance`,
      );
      setAttendance(data.attendance ?? []);
      setClubs(data.clubs ?? []);
      setAttendanceDrafts({});
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to load attendance");
    }
  }

  useEffect(() => {
    if (!selectedMeetingId) return;
    // Fetching data on selection change is a valid use of useEffect
    void loadAttendance(selectedMeetingId);
  }, [selectedMeetingId]);

  async function onCreateMeeting(event: FormEvent) {
    event.preventDefault();
    const startsAt = toIsoFromDatetimeLocal(newMeetingStartsAt);
    if (!startsAt) {
      setStatus("Start time required.");
      return;
    }

    setStatus("Creating meeting...");

    try {
      await fetchJson<{ meeting: IccMeeting }>("/api/icc/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          starts_at: startsAt,
          location: newMeetingLocation.trim() || null,
        }),
      });

      setNewMeetingStartsAt("");
      setNewMeetingLocation("");
      await reloadMeetings();
      setStatus("Meeting created.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to create meeting");
    }
  }

  function updateMeetingDraft(meetingId: string, patch: Partial<MeetingDraft>) {
    const meeting = meetings.find((m) => m.id === meetingId);
    if (!meeting) return;
    const base: MeetingDraft = {
      location: meeting.location ?? "",
      status: meeting.status,
      advisor_present: meeting.advisor_present,
      called_to_order_at: datetimeLocalFromIso(meeting.called_to_order_at),
    };
    setMeetingDrafts((prev) => ({
      ...prev,
      [meetingId]: {
        ...(prev[meetingId] ?? base),
        ...patch,
      },
    }));
  }

  async function saveMeeting(meeting: IccMeeting) {
    const draft = meetingDrafts[meeting.id] ?? {
      location: meeting.location ?? "",
      status: meeting.status,
      advisor_present: meeting.advisor_present,
      called_to_order_at: datetimeLocalFromIso(meeting.called_to_order_at),
    };

    setStatus("Saving meeting...");
    try {
      await fetchJson<{ meeting: IccMeeting }>(`/api/icc/meetings/${encodeURIComponent(meeting.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: draft.location.trim() || null,
          status: draft.status,
          advisor_present: draft.advisor_present,
          called_to_order_at: draft.called_to_order_at ? toIsoFromDatetimeLocal(draft.called_to_order_at) : null,
        }),
      });
      await reloadMeetings();
      setStatus("Meeting updated.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to update meeting");
    }
  }

  function updateAttendanceDraft(clubId: string, patch: Partial<AttendanceDraft>) {
    setAttendanceDrafts((prev) => {
      const existing = attendanceByClubId.get(clubId);
      const base: AttendanceDraft = {
        status: existing?.status ?? "absent",
        excused_reason: existing?.excused_reason ?? "",
        notes: existing?.notes ?? "",
      };
      return {
        ...prev,
        [clubId]: { ...(prev[clubId] ?? base), ...patch },
      };
    });
  }

  async function saveAttendance(clubId: string) {
    if (!selectedMeetingId) return;
    const draft = resolveAttendanceDraft(clubId);

    setStatus("Saving attendance...");
    try {
      await fetchJson<{ attendance: AttendanceRow }>(
        `/api/icc/meetings/${encodeURIComponent(selectedMeetingId)}/attendance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clubId,
            status: draft.status,
            excused_reason: draft.status === "excused" ? draft.excused_reason.trim() || null : null,
            notes: draft.notes.trim() || null,
          }),
        },
      );
      await loadAttendance(selectedMeetingId);
      setStatus("Attendance updated.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to update attendance");
    }
  }

  async function saveAllAttendance() {
    if (!selectedMeetingId) return;
    const dirtyClubIds = clubs.map((club) => club.id).filter((id) => hasAttendanceChanges(id));
    if (dirtyClubIds.length === 0) {
      setStatus("No attendance changes to save.");
      return;
    }

    setIsSavingAttendance(true);
    setStatus(`Saving ${dirtyClubIds.length} updates...`);
    try {
      await Promise.all(
        dirtyClubIds.map((clubId) => {
          const draft = resolveAttendanceDraft(clubId);
          return fetchJson<{ attendance: AttendanceRow }>(
            `/api/icc/meetings/${encodeURIComponent(selectedMeetingId)}/attendance`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                clubId,
                status: draft.status,
                excused_reason: draft.status === "excused" ? draft.excused_reason.trim() || null : null,
                notes: draft.notes.trim() || null,
              }),
            },
          );
        }),
      );
      await loadAttendance(selectedMeetingId);
      setStatus(`Saved ${dirtyClubIds.length} attendance updates.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save attendance");
    } finally {
      setIsSavingAttendance(false);
    }
  }

  return (
    <div className="space-y-8">
      {status ? (
        <div className="text-sm text-foreground/70" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}

      {isAdmin ? (
        <form onSubmit={onCreateMeeting} className="rounded-lg border p-4">
          <div className="text-sm font-medium">Create ICC meeting</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              className="rounded border px-3 py-2 text-sm"
              type="datetime-local"
              aria-label="Meeting start time"
              value={newMeetingStartsAt}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setNewMeetingStartsAt(event.target.value)}
            />
            <input
              className="rounded border px-3 py-2 text-sm"
              placeholder="Location"
              aria-label="Meeting location"
              value={newMeetingLocation}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setNewMeetingLocation(event.target.value)}
            />
          </div>
          <div className="mt-4">
            <Button type="submit" disabled={!newMeetingStartsAt}>
              Create meeting
            </Button>
          </div>
        </form>
      ) : null}

      <div className="space-y-4">
        <div className="rounded-lg border p-3">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Search meetings</div>
              <input
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={meetingSearch}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setMeetingSearch(event.target.value)}
                placeholder="Location, notes, date..."
              />
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Status</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={meetingStatusFilter}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setMeetingStatusFilter(event.target.value as IccMeeting["status"] | "")
                }
              >
                <option value="">All</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Sort</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={meetingSort}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setMeetingSort(event.target.value as "newest" | "oldest")
                }
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/60">
            <span>
              Showing {filteredMeetings.length} of {meetings.length} meetings
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <span>Scheduled {meetingCounts.scheduled}</span>
              <span>Completed {meetingCounts.completed}</span>
              <span>Cancelled {meetingCounts.cancelled}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMeetingSearch("");
                setMeetingStatusFilter("");
                setMeetingSort("newest");
              }}
              disabled={!meetingSearch && !meetingStatusFilter && meetingSort === "newest"}
            >
              Clear filters
            </Button>
          </div>
        </div>

        {meetings.length === 0 ? (
          <div className="text-sm text-foreground/70">No ICC meetings yet.</div>
        ) : filteredMeetings.length === 0 ? (
          <div className="text-sm text-foreground/70">No meetings match the current filters.</div>
        ) : (
          filteredMeetings.map((meeting) => {
            const draft = meetingDrafts[meeting.id] ?? {
              location: meeting.location ?? "",
              status: meeting.status,
              advisor_present: meeting.advisor_present,
              called_to_order_at: datetimeLocalFromIso(meeting.called_to_order_at),
            };
            return (
              <div key={meeting.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-semibold">Meeting {formatDateTime(meeting.starts_at)}</div>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${meetingStatusBadge(meeting.status)}`}
                      >
                        {meetingStatusLabel(meeting.status)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-foreground/60">
                      {meeting.location ? `Location: ${meeting.location} · ` : ""}
                      Quorum:{" "}
                      {meeting.quorum
                        ? `${meeting.quorum.present_count}/${meeting.quorum.quorum_required} (${meeting.quorum.quorum_met ? "met" : "not met"})`
                        : "-"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedMeetingId(meeting.id);
                        // Scroll to attendance section after a brief delay to allow state update
                        setTimeout(() => {
                          attendanceSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }, 100);
                      }}
                    >
                      Manage attendance
                    </Button>
                    {isAdmin ? (
                      <Button variant="outline" size="sm" onClick={() => void saveMeeting(meeting)}>
                        Save meeting
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <input
                    className="rounded border px-3 py-2 text-sm"
                    placeholder="Location"
                    aria-label="Meeting location"
                    value={draft.location}
                    onChange={(event) => updateMeetingDraft(meeting.id, { location: event.target.value })}
                    disabled={!isAdmin}
                  />
                  <select
                    className="rounded border px-3 py-2 text-sm"
                    aria-label="Meeting status"
                    value={draft.status}
                    onChange={(event) =>
                      updateMeetingDraft(meeting.id, { status: event.target.value as IccMeeting["status"] })
                    }
                    disabled={!isAdmin}
                  >
                    <option value="scheduled">scheduled</option>
                    <option value="cancelled">cancelled</option>
                    <option value="completed">completed</option>
                  </select>
                  <input
                    className="rounded border px-3 py-2 text-sm"
                    type="datetime-local"
                    aria-label="Called to order time"
                    value={draft.called_to_order_at}
                    onChange={(event) => updateMeetingDraft(meeting.id, { called_to_order_at: event.target.value })}
                    disabled={!isAdmin}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.advisor_present}
                      onChange={(event) => updateMeetingDraft(meeting.id, { advisor_present: event.target.checked })}
                      disabled={!isAdmin}
                    />
                    Advisor present
                  </label>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div ref={attendanceSectionRef} className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Attendance</div>
            <div className="text-xs text-foreground/60">Mark call-to-order attendance and excused absences.</div>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="rounded border px-3 py-2 text-sm"
              aria-label="Select meeting"
              value={selectedMeetingId}
              onChange={(event) => {
                setSelectedMeetingId(event.target.value);
                setAttendancePage(1);
              }}
            >
              <option value="">Select meeting</option>
              {meetings.map((meeting) => (
                <option key={meeting.id} value={meeting.id}>
                  {formatDateTime(meeting.starts_at)} · {meetingStatusLabel(meeting.status)}
                </option>
              ))}
            </select>
            {selectedMeetingId ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  (window.location.href = `/api/icc/meetings/${encodeURIComponent(selectedMeetingId)}/export`)
                }
              >
                Export CSV
              </Button>
            ) : null}
          </div>
        </div>

        {selectedMeetingId ? (
          <>
            <div className="mt-4 rounded-lg border p-3">
              <div className="grid gap-3 md:grid-cols-4">
                <label className="space-y-1 text-sm">
                  <div className="text-foreground/70">Search clubs</div>
                  <input
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                    value={attendanceQuery}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setAttendanceQuery(event.target.value);
                      setAttendancePage(1);
                    }}
                    placeholder="Club name..."
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <div className="text-foreground/70">Attendance</div>
                  <select
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                    value={attendanceStatusFilter}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                      setAttendanceStatusFilter(event.target.value as AttendanceRow["status"] | "");
                      setAttendancePage(1);
                    }}
                  >
                    <option value="">All</option>
                    <option value="present">Present</option>
                    <option value="excused">Excused</option>
                    <option value="absent">Absent</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <div className="text-foreground/70">Club status</div>
                  <select
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                    value={clubStatusFilter}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                      setClubStatusFilter(event.target.value as ClubRow["status"] | "");
                      setAttendancePage(1);
                    }}
                  >
                    <option value="">All</option>
                    <option value="chartered">Chartered</option>
                    <option value="pending">Pending</option>
                    <option value="suspended">Suspended</option>
                    <option value="revoked">Revoked</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <div className="text-foreground/70">Sort</div>
                  <select
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                    value={attendanceSort}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                      setAttendanceSort(event.target.value as "name" | "status");
                      setAttendancePage(1);
                    }}
                  >
                    <option value="name">Club name</option>
                    <option value="status">Attendance status</option>
                  </select>
                </label>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/60">
                <span>
                  Showing {paginatedClubs.length} of {filteredClubs.length} clubs
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <span>Present {attendanceSummary.present}</span>
                  <span>Excused {attendanceSummary.excused}</span>
                  <span>Absent {attendanceSummary.absent}</span>
                  <span>Unsaved {dirtyAttendanceCount}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2">
                    <span>Rows</span>
                    <select
                      className="h-8 rounded-md border bg-transparent px-2 text-xs"
                      value={attendancePageSize}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                        setAttendancePageSize(Number(event.target.value));
                        setAttendancePage(1);
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </label>
                  <span>
                    Page {resolvedAttendancePage} of {attendancePageCount}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAttendancePage(Math.max(1, resolvedAttendancePage - 1))}
                    disabled={resolvedAttendancePage <= 1}
                  >
                    Prev
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAttendancePage(Math.min(attendancePageCount, resolvedAttendancePage + 1))}
                    disabled={resolvedAttendancePage >= attendancePageCount}
                  >
                    Next
                  </Button>
                  {isAdmin ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void saveAllAttendance()}
                      disabled={dirtyAttendanceCount === 0 || isSavingAttendance}
                    >
                      Save all changes ({dirtyAttendanceCount})
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAttendanceQuery("");
                      setAttendanceStatusFilter("");
                      setClubStatusFilter("");
                      setAttendanceSort("name");
                      setAttendancePage(1);
                    }}
                    disabled={
                      !attendanceQuery &&
                      !attendanceStatusFilter &&
                      !clubStatusFilter &&
                      attendanceSort === "name"
                    }
                  >
                    Clear filters
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {paginatedClubs.length === 0 ? (
                <div className="text-sm text-foreground/70">No clubs match the current filters.</div>
              ) : (
                paginatedClubs.map((club) => {
                  const draft = resolveAttendanceDraft(club.id);
                  const isDirty = hasAttendanceChanges(club.id);

                  return (
                    <div key={club.id} className="rounded border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-medium">{club.name}</div>
                            {isDirty ? (
                              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-700">
                                Unsaved
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-foreground/60">Status: {club.status}</div>
                        </div>
                        {isAdmin ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void saveAttendance(club.id)}
                            disabled={isSavingAttendance}
                          >
                            Save
                          </Button>
                        ) : null}
                      </div>

                      <div className="mt-2 grid gap-2 md:grid-cols-3">
                        <select
                          className="rounded border px-2 py-1 text-sm"
                          aria-label={`${club.name} attendance status`}
                          value={draft.status}
                          onChange={(event) =>
                            updateAttendanceDraft(club.id, { status: event.target.value as AttendanceRow["status"] })
                          }
                          disabled={!isAdmin}
                        >
                          <option value="present">present</option>
                          <option value="absent">absent</option>
                          <option value="excused">excused</option>
                        </select>
                        <input
                          className="rounded border px-2 py-1 text-sm"
                          placeholder="Excused reason"
                          aria-label={`${club.name} excused reason`}
                          value={draft.excused_reason}
                          onChange={(event) => updateAttendanceDraft(club.id, { excused_reason: event.target.value })}
                          disabled={!isAdmin || draft.status !== "excused"}
                        />
                        <input
                          className="rounded border px-2 py-1 text-sm"
                          placeholder="Notes"
                          aria-label={`${club.name} attendance notes`}
                          value={draft.notes}
                          onChange={(event) => updateAttendanceDraft(club.id, { notes: event.target.value })}
                          disabled={!isAdmin}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div className="mt-3 text-sm text-foreground/70">Select a meeting to manage attendance.</div>
        )}
      </div>
    </div>
  );
}

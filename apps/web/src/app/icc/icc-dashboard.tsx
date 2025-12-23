"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";

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

  const attendanceByClubId = useMemo(() => {
    const map = new Map<string, AttendanceRow>();
    for (const row of attendance) {
      map.set(row.club_id, row);
    }
    return map;
  }, [attendance]);

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
    const existing = attendanceByClubId.get(clubId);
    const base: AttendanceDraft = {
      status: existing?.status ?? "absent",
      excused_reason: existing?.excused_reason ?? "",
      notes: existing?.notes ?? "",
    };
    setAttendanceDrafts((prev) => ({
      ...prev,
      [clubId]: { ...(prev[clubId] ?? base), ...patch },
    }));
  }

  async function saveAttendance(clubId: string) {
    if (!selectedMeetingId) return;
    const draft = attendanceDrafts[clubId] ?? {
      status: attendanceByClubId.get(clubId)?.status ?? "absent",
      excused_reason: attendanceByClubId.get(clubId)?.excused_reason ?? "",
      notes: attendanceByClubId.get(clubId)?.notes ?? "",
    };

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

  return (
    <div className="space-y-8">
      {status ? <div className="text-sm text-foreground/70">{status}</div> : null}

      {isAdmin ? (
        <form onSubmit={onCreateMeeting} className="rounded-lg border p-4">
          <div className="text-sm font-medium">Create ICC meeting</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              className="rounded border px-3 py-2 text-sm"
              type="datetime-local"
              value={newMeetingStartsAt}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setNewMeetingStartsAt(event.target.value)}
            />
            <input
              className="rounded border px-3 py-2 text-sm"
              placeholder="Location"
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
        {meetings.length === 0 ? (
          <div className="text-sm text-foreground/70">No ICC meetings yet.</div>
        ) : (
          meetings.map((meeting) => {
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
                    <div className="text-base font-semibold">Meeting {formatDateTime(meeting.starts_at)}</div>
                    <div className="text-xs text-foreground/60">
                      Status: {meeting.status} · Quorum:{" "}
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
                        void loadAttendance(meeting.id);
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
                    value={draft.location}
                    onChange={(event) => updateMeetingDraft(meeting.id, { location: event.target.value })}
                    disabled={!isAdmin}
                  />
                  <select
                    className="rounded border px-3 py-2 text-sm"
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

      <div className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Attendance</div>
            <div className="text-xs text-foreground/60">Mark call-to-order attendance and excused absences.</div>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="rounded border px-3 py-2 text-sm"
              value={selectedMeetingId}
              onChange={(event) => {
                setSelectedMeetingId(event.target.value);
                void loadAttendance(event.target.value);
              }}
            >
              <option value="">Select meeting</option>
              {meetings.map((meeting) => (
                <option key={meeting.id} value={meeting.id}>
                  {formatDateTime(meeting.starts_at)}
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
          <div className="mt-4 space-y-3">
            {clubs.map((club) => {
              const existing = attendanceByClubId.get(club.id);
              const draft = attendanceDrafts[club.id] ?? {
                status: existing?.status ?? "absent",
                excused_reason: existing?.excused_reason ?? "",
                notes: existing?.notes ?? "",
              };

              return (
                <div key={club.id} className="rounded border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{club.name}</div>
                      <div className="text-xs text-foreground/60">Status: {club.status}</div>
                    </div>
                    {isAdmin ? (
                      <Button size="sm" variant="outline" onClick={() => void saveAttendance(club.id)}>
                        Save
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <select
                      className="rounded border px-2 py-1 text-sm"
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
                      value={draft.excused_reason}
                      onChange={(event) => updateAttendanceDraft(club.id, { excused_reason: event.target.value })}
                      disabled={!isAdmin || draft.status !== "excused"}
                    />
                    <input
                      className="rounded border px-2 py-1 text-sm"
                      placeholder="Notes"
                      value={draft.notes}
                      onChange={(event) => updateAttendanceDraft(club.id, { notes: event.target.value })}
                      disabled={!isAdmin}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 text-sm text-foreground/70">Select a meeting to manage attendance.</div>
        )}
      </div>
    </div>
  );
}

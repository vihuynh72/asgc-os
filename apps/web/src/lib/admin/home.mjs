import { buildAdminHref, getVisibleAdminDomains } from "./navigation.mjs";

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildPeopleCard(snapshot) {
  const pendingInvites = snapshot.people.pendingInvites;
  const blockedEntries = snapshot.people.blockedEntries;
  const pendingGrants = snapshot.people.pendingGrants;

  let status = "Invite queue is calm and access changes look stable.";
  if (pendingInvites > 0) {
    status = `${pluralize(pendingInvites, "invited member")} still need${pendingInvites === 1 ? "s" : ""} their first sign-in.`;
  } else if (pendingGrants > 0) {
    status = `${pluralize(pendingGrants, "pre-login role grant")} are still waiting to be applied.`;
  } else if (blockedEntries > 0) {
    status = `${pluralize(blockedEntries, "blocked invite pattern")} should be reviewed against current access decisions.`;
  }

  return {
    id: "people",
    href: "/admin/people",
    title: "People",
    badge: pendingInvites > 0 ? `${pluralize(pendingInvites, "pending invite")}` : null,
    status,
    description: `Current term: ${snapshot.currentTermName}. Invite access, assignments, and term changes stay separate from each other.`,
    primaryLabel: "Open invite queue",
  };
}

function buildOfficeHoursCard(snapshot) {
  const officeReady = snapshot.officeHours.officeReady;
  const configuredRoles = snapshot.officeHours.configuredRoles;

  return {
    id: "office_hours",
    href: "/admin/office-hours",
    title: "Office Hours",
    badge: officeReady ? null : "Needs setup",
    status: officeReady
      ? "Sessions, requirements, and configuration are ready to work in."
      : "Office Hours setup still needs attention before weekly operations feel reliable.",
    description: officeReady
      ? `${pluralize(configuredRoles, "role")} already have requirements configured for the current term.`
      : "Finish setup first, then move into sessions, requirements, or export without extra clutter.",
    primaryLabel: "Open sessions",
  };
}

function buildMeetingsCard(snapshot) {
  const missingNoticeCount = snapshot.meetings.missingNoticeCount;
  const missingAgendaCount = snapshot.meetings.missingAgendaCount;
  const upcomingMeetings = snapshot.meetings.upcomingMeetings;

  let status = "Upcoming meetings and publishing checks look on track.";
  if (missingNoticeCount > 0) {
    status = `${pluralize(missingNoticeCount, "scheduled meeting")} still need${missingNoticeCount === 1 ? "s" : ""} public notice.`;
  } else if (missingAgendaCount > 0) {
    status = `${pluralize(missingAgendaCount, "scheduled meeting")} still need${missingAgendaCount === 1 ? "s" : ""} an agenda.`;
  }

  return {
    id: "meetings",
    href: "/admin/meetings",
    title: "Meetings",
    badge: missingNoticeCount > 0 ? `${pluralize(missingNoticeCount, "notice")}` : null,
    status,
    description: upcomingMeetings > 0 ? `${pluralize(upcomingMeetings, "upcoming meeting")} are currently on the queue.` : "No upcoming meetings are on the queue right now.",
    primaryLabel: "Open meeting queue",
  };
}

function buildIssues(snapshot, visibleDomains) {
  const issues = [];

  if (visibleDomains.includes("people")) {
    if (snapshot.people.pendingInvites > 0) {
      issues.push({
        id: "people-pending-invites",
        domainId: "people",
        href: "/admin/people",
        label: "People",
        message: `${pluralize(snapshot.people.pendingInvites, "invited member")} still need${snapshot.people.pendingInvites === 1 ? "s" : ""} their first sign-in.`,
        tone: "warning",
      });
    }
    if (snapshot.people.pendingGrants > 0) {
      issues.push({
        id: "people-pending-grants",
        domainId: "people",
        href: "/admin/people/assignments",
        label: "People",
        message: `${pluralize(snapshot.people.pendingGrants, "pre-login role grant")} are still waiting to be applied.`,
        tone: "warning",
      });
    }
    if (snapshot.people.blockedEntries > 0) {
      issues.push({
        id: "people-blocklist",
        domainId: "people",
        href: "/admin/people/access-audit",
        label: "People",
        message: `${pluralize(snapshot.people.blockedEntries, "blocked invite pattern")} should be reviewed against current access decisions.`,
        tone: "warning",
      });
    }
  }

  if (visibleDomains.includes("office_hours") && !snapshot.officeHours.officeReady) {
    issues.push({
      id: "office-hours-setup",
      domainId: "office_hours",
      href: "/admin/office-hours/config",
      label: "Office Hours",
      message: "Office setup still needs review before specialist workflows are dependable.",
      tone: "warning",
    });
  }

  if (visibleDomains.includes("meetings")) {
    if (snapshot.meetings.missingNoticeCount > 0) {
      issues.push({
        id: "meetings-notices",
        domainId: "meetings",
        href: "/admin/meetings#admin-meetings-upcoming",
        label: "Meetings",
        message: `${pluralize(snapshot.meetings.missingNoticeCount, "scheduled meeting")} still need${snapshot.meetings.missingNoticeCount === 1 ? "s" : ""} public notice.`,
        tone: "warning",
      });
    }
    if (snapshot.meetings.missingAgendaCount > 0) {
      issues.push({
        id: "meetings-agendas",
        domainId: "meetings",
        href: "/admin/meetings#admin-meetings-existing",
        label: "Meetings",
        message: `${pluralize(snapshot.meetings.missingAgendaCount, "scheduled meeting")} ${snapshot.meetings.missingAgendaCount === 1 ? "is" : "are"} still missing ${snapshot.meetings.missingAgendaCount === 1 ? "an agenda" : "agendas"}.`,
        tone: "warning",
      });
    }
  }

  return issues;
}

export function buildAdminHomeViewModel({ tier, isEvp, snapshot }) {
  const visibleDomains = getVisibleAdminDomains({ tier, isEvp });

  const cards = visibleDomains.map((domainId) => {
    if (domainId === "people") return buildPeopleCard(snapshot);
    if (domainId === "office_hours") return buildOfficeHoursCard(snapshot);
    return buildMeetingsCard(snapshot);
  });

  return {
    title: "Admin",
    description: "A calm overview of what needs attention, without turning the page into a control wall.",
    cards,
    issues: buildIssues(snapshot, visibleDomains),
    primaryPath: visibleDomains[0] ? buildAdminHref(visibleDomains[0]) : "/admin/meetings",
  };
}

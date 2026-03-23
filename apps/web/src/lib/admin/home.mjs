import { buildAdminHref, getVisibleAdminDomains } from "./navigation.mjs";

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

const DOMAIN_ORDER = {
  people: 0,
  office_hours: 1,
  communications: 2,
  meetings: 3,
};

const STATUS_PRIORITY = {
  critical: 0,
  warning: 1,
  neutral: 2,
  good: 3,
};

function buildPeopleCard(snapshot) {
  const pendingInvites = snapshot.people.pendingInvites;
  const blockedEntries = snapshot.people.blockedEntries;
  const pendingGrants = snapshot.people.pendingGrants;

  let status = "Queue clear";
  let statusShort = "Ready";
  let statusTone = "good";
  let statusIcon = "check";
  let count = 0;

  if (pendingInvites > 0) {
    status = `${pluralize(pendingInvites, "invite")} waiting`;
    statusShort = "Invites pending";
    statusTone = "warning";
    statusIcon = "clock";
    count = pendingInvites;
  } else if (pendingGrants > 0) {
    status = `${pluralize(pendingGrants, "grant")} waiting`;
    statusShort = "Grants queued";
    statusTone = "warning";
    statusIcon = "clock";
    count = pendingGrants;
  } else if (blockedEntries > 0) {
    status = `${pluralize(blockedEntries, "block rule")} to review`;
    statusShort = "Blocks to review";
    statusTone = "warning";
    statusIcon = "clock";
    count = blockedEntries;
  }

  return {
    id: "people",
    href: "/admin/people",
    title: "People",
    status,
    statusShort,
    statusTone,
    statusIcon,
    count,
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
    status: officeReady ? `${pluralize(configuredRoles, "role")} configured` : "Setup still needed",
    statusShort: officeReady ? "Ready" : "Setup required",
    statusTone: officeReady ? "good" : "warning",
    statusIcon: officeReady ? "check" : "clock",
    count: officeReady ? configuredRoles : 0,
    primaryLabel: "Open overview",
  };
}

function buildCommunicationsCard(snapshot) {
  const recentFailures = snapshot.communications?.recentFailures ?? 0;
  const templateCount = snapshot.communications?.templateCount ?? 0;

  return {
    id: "communications",
    href: "/admin/communications",
    title: "Communications",
    status: recentFailures > 0 ? `${pluralize(recentFailures, "email failure")} to review` : `${pluralize(templateCount, "template")} ready`,
    statusShort: recentFailures > 0 ? "Attention needed" : "Ready",
    statusTone: recentFailures > 0 ? "warning" : "good",
    statusIcon: recentFailures > 0 ? "clock" : "check",
    count: recentFailures > 0 ? recentFailures : templateCount,
    primaryLabel: "Open email lab",
  };
}

function buildMeetingsCard(snapshot) {
  const missingNoticeCount = snapshot.meetings.missingNoticeCount;
  const missingAgendaCount = snapshot.meetings.missingAgendaCount;
  const upcomingMeetings = snapshot.meetings.upcomingMeetings;

  let status = "Queue on track";
  let statusShort = "On track";
  let statusTone = "good";
  let statusIcon = "check";
  let count = upcomingMeetings;

  if (missingNoticeCount > 0) {
    status = `${pluralize(missingNoticeCount, "notice")} due`;
    statusShort = "Notice due";
    statusTone = "critical";
    statusIcon = "triangle";
    count = missingNoticeCount;
  } else if (missingAgendaCount > 0) {
    status = `${pluralize(missingAgendaCount, "agenda")} missing`;
    statusShort = "Agenda due";
    statusTone = "warning";
    statusIcon = "clock";
    count = missingAgendaCount;
  }

  return {
    id: "meetings",
    href: "/admin/meetings",
    title: "Meetings",
    status,
    statusShort,
    statusTone,
    statusIcon,
    count,
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
        label: "Pending invites",
        count: snapshot.people.pendingInvites,
        statusTone: "warning",
        statusIcon: "clock",
        priority: STATUS_PRIORITY.warning,
      });
    }
    if (snapshot.people.pendingGrants > 0) {
      issues.push({
        id: "people-pending-grants",
        domainId: "people",
        href: "/admin/people/assignments",
        label: "Role grants",
        count: snapshot.people.pendingGrants,
        statusTone: "warning",
        statusIcon: "clock",
        priority: STATUS_PRIORITY.warning,
      });
    }
    if (snapshot.people.blockedEntries > 0) {
      issues.push({
        id: "people-blocklist",
        domainId: "people",
        href: "/admin/people/access-audit",
        label: "Blocked patterns",
        count: snapshot.people.blockedEntries,
        statusTone: "warning",
        statusIcon: "clock",
        priority: STATUS_PRIORITY.warning,
      });
    }
  }

  if (visibleDomains.includes("office_hours") && !snapshot.officeHours.officeReady) {
    issues.push({
      id: "office-hours-setup",
      domainId: "office_hours",
      href: "/admin/office-hours/config",
      label: "Setup review",
      count: 1,
      statusTone: "warning",
      statusIcon: "clock",
      priority: STATUS_PRIORITY.warning,
    });
  }

  if (visibleDomains.includes("communications") && (snapshot.communications?.recentFailures ?? 0) > 0) {
    issues.push({
      id: "communications-failures",
      domainId: "communications",
      href: "/admin/communications",
      label: "Email failures",
      count: snapshot.communications.recentFailures,
      statusTone: "warning",
      statusIcon: "clock",
      priority: STATUS_PRIORITY.warning,
    });
  }

  if (visibleDomains.includes("meetings")) {
    if (snapshot.meetings.missingNoticeCount > 0) {
      issues.push({
        id: "meetings-notices",
        domainId: "meetings",
        href: "/admin/meetings#admin-meetings-upcoming",
        label: "Post notices",
        count: snapshot.meetings.missingNoticeCount,
        statusTone: "critical",
        statusIcon: "triangle",
        priority: STATUS_PRIORITY.critical,
      });
    }
    if (snapshot.meetings.missingAgendaCount > 0) {
      issues.push({
        id: "meetings-agendas",
        domainId: "meetings",
        href: "/admin/meetings#admin-meetings-existing",
        label: "Agenda missing",
        count: snapshot.meetings.missingAgendaCount,
        statusTone: "warning",
        statusIcon: "clock",
        priority: STATUS_PRIORITY.warning,
      });
    }
  }

  return issues
    .map((issue, sortIndex) => ({ issue, sortIndex }))
    .sort((a, b) => {
      const priority = a.issue.priority - b.issue.priority;
      if (priority !== 0) return priority;
      const domain =
        (DOMAIN_ORDER[a.issue.domainId] ?? Number.MAX_SAFE_INTEGER) -
        (DOMAIN_ORDER[b.issue.domainId] ?? Number.MAX_SAFE_INTEGER);
      if (domain !== 0) return domain;
      return a.sortIndex - b.sortIndex;
    })
    .map((entry) => entry.issue);
}

export function buildAdminHomeViewModel({ tier, isEvp, snapshot }) {
  const visibleDomains = getVisibleAdminDomains({ tier, isEvp });

  const cards = visibleDomains.map((domainId) => {
    if (domainId === "people") return buildPeopleCard(snapshot);
    if (domainId === "office_hours") return buildOfficeHoursCard(snapshot);
    if (domainId === "communications") return buildCommunicationsCard(snapshot);
    return buildMeetingsCard(snapshot);
  });

  return {
    title: "Admin",
    description: "See what matters now, then jump in.",
    cards,
    issues: buildIssues(snapshot, visibleDomains),
    primaryPath: visibleDomains[0] ? buildAdminHref(visibleDomains[0]) : "/admin/meetings",
  };
}

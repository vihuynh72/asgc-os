const DOMAIN_ORDER = ["people", "office_hours", "meetings"];

const SECTION_NAV = {
  people: [
    { id: "invites", label: "Invites", href: "/admin/people" },
    { id: "assignments", label: "Assignments", href: "/admin/people/assignments" },
    { id: "terms", label: "Terms", href: "/admin/people/terms" },
    { id: "access_audit", label: "Access Audit", href: "/admin/people/access-audit" },
  ],
  office_hours: [
    { id: "sessions", label: "Sessions", href: "/admin/office-hours" },
    { id: "requirements", label: "Requirements", href: "/admin/office-hours/requirements" },
    { id: "kiosk", label: "Kiosk", href: "/admin/office-hours/kiosk" },
    { id: "config", label: "Config", href: "/admin/office-hours/config" },
    { id: "export", label: "Export", href: "/admin/office-hours/export" },
  ],
  meetings: [
    { id: "queue", label: "Queue", href: "/admin/meetings" },
    { id: "create", label: "Create", href: "/admin/meetings#admin-meetings-create" },
    { id: "upcoming", label: "Upcoming", href: "/admin/meetings#admin-meetings-upcoming" },
    { id: "committees", label: "Committees", href: "/admin/meetings#admin-meetings-committees" },
    { id: "existing", label: "Existing", href: "/admin/meetings#admin-meetings-existing" },
  ],
};

const DOMAIN_META = {
  people: {
    label: "People",
    description: "Invites, assignments, terms, and access checks.",
    href: "/admin/people",
  },
  office_hours: {
    label: "Office Hours",
    description: "Sessions, kiosk settings, requirements, and configuration.",
    href: "/admin/office-hours",
  },
  meetings: {
    label: "Meetings",
    description: "Create, publish, and maintain meeting operations.",
    href: "/admin/meetings",
  },
};

const LEGACY_TAB_MAP = {
  access: { pathname: "/admin/people/invites", hash: "" },
  roles: { pathname: "/admin/people/assignments", hash: "" },
  office_hours: { pathname: "/admin/office-hours", hash: "" },
  meetings: { pathname: "/admin/meetings", hash: "" },
};

const MEETING_HASH_BY_SECTION = {
  create: "#admin-meetings-create",
  upcoming: "#admin-meetings-upcoming",
  committees: "#admin-meetings-committees",
  existing: "#admin-meetings-existing",
};

const VALID_MEETING_HASHES = new Set(Object.values(MEETING_HASH_BY_SECTION));

function normalizeValue(value) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function isDomainVisible(domainId, { tier, isEvp }) {
  if (domainId === "people") return tier === "full";
  if (domainId === "office_hours") return (tier === "full" || isEvp === true) && tier !== "read-only";
  return true;
}

function normalizePathname(pathname) {
  if (typeof pathname !== "string" || pathname.trim().length === 0) return "/admin";
  const trimmed = pathname.trim();
  return trimmed.endsWith("/") && trimmed !== "/" ? trimmed.slice(0, -1) : trimmed;
}

function buildPeoplePath(section) {
  if (!section || section === "overview" || section === "invites") return "/admin/people";
  if (section === "access_audit" || section === "audit") return "/admin/people/access-audit";
  if (section === "assignments" || section === "terms") {
    return `/admin/people/${section}`;
  }
  return "/admin/people";
}

function buildOfficeHoursPath(section) {
  if (!section || section === "overview" || section === "summary" || section === "sessions") return "/admin/office-hours";
  if (section === "requirements" || section === "config" || section === "kiosk") {
    return `/admin/office-hours/${section}`;
  }
  if (section === "export") return "/admin/office-hours/export";
  if (section === "csv") return "/admin/office-hours/export/csv";
  return "/admin/office-hours";
}

function buildMeetingsLocation(section, hash) {
  const nextHash =
    section === "queue" ? "" : MEETING_HASH_BY_SECTION[section] ?? (VALID_MEETING_HASHES.has(hash) ? hash : "");
  return { pathname: "/admin/meetings", hash: nextHash ?? "" };
}

function parseDomainFromPath(pathname) {
  const segments = normalizePathname(pathname).split("/").filter(Boolean);
  if (segments[0] !== "admin") return { domainId: null, section: null };
  if (!segments[1]) return { domainId: null, section: null };
  if (segments[1] === "people") {
    return {
      domainId: "people",
      section: segments[2] === "access-audit" ? "access_audit" : segments[2] ?? "invites",
    };
  }
  if (segments[1] === "office-hours") {
    if (segments[2] === "export" && segments[3] === "csv") return { domainId: "office_hours", section: "csv" };
    if (segments[2] === "export") return { domainId: "office_hours", section: "export" };
    return { domainId: "office_hours", section: segments[2] ?? "sessions" };
  }
  if (segments[1] === "meetings") return { domainId: "meetings", section: "queue" };
  if (segments[1] === "audit") return { domainId: "people", section: "access_audit" };
  return { domainId: null, section: null };
}

export function getVisibleAdminDomains({ tier, isEvp }) {
  return DOMAIN_ORDER.filter((domainId) => isDomainVisible(domainId, { tier, isEvp }));
}

export function getDefaultAdminPath({ tier, isEvp }) {
  const visible = getVisibleAdminDomains({ tier, isEvp });
  const domainId = visible[0] ?? "meetings";
  if (domainId === "people") return "/admin/people";
  if (domainId === "office_hours") return "/admin/office-hours";
  return "/admin/meetings";
}

export function buildAdminHref(domainId, section) {
  if (domainId === "people") return buildPeoplePath(section);
  if (domainId === "office_hours") return buildOfficeHoursPath(section);
  const meetingLocation = buildMeetingsLocation(section, "");
  return `${meetingLocation.pathname}${meetingLocation.hash}`;
}

export function getAdminPrimaryNav({ tier, isEvp }) {
  const items = [{ id: "hub", label: "Overview", href: "/admin" }];

  for (const domainId of getVisibleAdminDomains({ tier, isEvp })) {
    items.push({
      id: domainId,
      label: DOMAIN_META[domainId].label,
      href: DOMAIN_META[domainId].href,
    });
  }

  if (tier === "full") {
    items.push({ id: "audit", label: "Audit", href: "/admin/audit" });
  }

  return items;
}

export function getAdminDomainMeta(domainId) {
  return DOMAIN_META[domainId] ?? null;
}

export function getAdminSectionNav(domainId) {
  return SECTION_NAV[domainId] ?? [];
}

export function normalizeAdminRoute({ pathname = "/admin", tab, section, hash = "", tier, isEvp }) {
  const requestedTab = normalizeValue(tab);
  const requestedSection = normalizeValue(section);

  if (requestedTab && LEGACY_TAB_MAP[requestedTab]) {
    const legacy = LEGACY_TAB_MAP[requestedTab];
    const { domainId } = parseDomainFromPath(legacy.pathname);
    if (!domainId || !isDomainVisible(domainId, { tier, isEvp })) {
      return {
        pathname: getDefaultAdminPath({ tier, isEvp }),
        hash: "",
        requestedTab,
        requestedSection,
      };
    }
    if (requestedTab === "meetings") {
      const meetingLocation = buildMeetingsLocation(requestedSection, hash);
      return { ...meetingLocation, requestedTab, requestedSection };
    }
    return { pathname: legacy.pathname, hash: legacy.hash, requestedTab, requestedSection };
  }

  if (requestedTab === "people") {
    if (!isDomainVisible("people", { tier, isEvp })) {
      return { pathname: getDefaultAdminPath({ tier, isEvp }), hash: "", requestedTab, requestedSection };
    }
    return {
      pathname: buildPeoplePath(requestedSection),
      hash: "",
      requestedTab,
      requestedSection,
    };
  }

  if (requestedTab === "office_hours") {
    if (!isDomainVisible("office_hours", { tier, isEvp })) {
      return { pathname: getDefaultAdminPath({ tier, isEvp }), hash: "", requestedTab, requestedSection };
    }
    return {
      pathname: buildOfficeHoursPath(requestedSection),
      hash: "",
      requestedTab,
      requestedSection,
    };
  }

  if (requestedTab === "meetings") {
    const meetingLocation = buildMeetingsLocation(requestedSection, hash);
    return { ...meetingLocation, requestedTab, requestedSection };
  }

  const { domainId, section: pathSection } = parseDomainFromPath(pathname);
  if (!domainId) {
    if (VALID_MEETING_HASHES.has(hash)) {
      return { pathname: "/admin/meetings", hash, requestedTab, requestedSection };
    }
    return { pathname: normalizePathname(pathname), hash: "", requestedTab, requestedSection };
  }

  if (!isDomainVisible(domainId, { tier, isEvp })) {
    return {
      pathname: getDefaultAdminPath({ tier, isEvp }),
      hash: "",
      requestedTab,
      requestedSection,
    };
  }

  if (domainId === "people") {
    return {
      pathname: buildPeoplePath(pathSection),
      hash: "",
      requestedTab,
      requestedSection,
    };
  }

  if (domainId === "office_hours") {
    return {
      pathname: buildOfficeHoursPath(pathSection),
      hash: "",
      requestedTab,
      requestedSection,
    };
  }

  const meetingLocation = buildMeetingsLocation(requestedSection, hash);
  return { ...meetingLocation, requestedTab, requestedSection };
}

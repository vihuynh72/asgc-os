const DOMAIN_ORDER = ["people", "office_hours", "meetings"];

const SECTION_DEFAULTS = {
  people: "invites",
  office_hours: "summary",
  meetings: "upcoming",
};

const SECTION_OPTIONS = {
  people: ["invites", "assignments", "terms", "audit"],
  office_hours: ["summary"],
  meetings: ["create", "upcoming", "committees", "existing"],
};

const LEGACY_TAB_MAP = {
  access: { tab: "people", section: "invites" },
  roles: { tab: "people", section: "assignments" },
};

export function getVisibleAdminDomains({ tier, isEvp }) {
  return DOMAIN_ORDER.filter((tab) => {
    if (tab === "people") return tier === "full";
    if (tab === "office_hours") return (tier === "full" || isEvp === true) && tier !== "read-only";
    return true;
  });
}

export function getDefaultAdminLocation({ tier, isEvp }) {
  const visible = getVisibleAdminDomains({ tier, isEvp });
  const tab = visible[0] ?? "meetings";
  return { tab, section: SECTION_DEFAULTS[tab] ?? "upcoming" };
}

export function normalizeAdminLocation({ tab, section, tier, isEvp }) {
  const requestedTab = typeof tab === "string" && tab.trim() ? tab.trim().toLowerCase() : null;
  const requestedSection = typeof section === "string" && section.trim() ? section.trim().toLowerCase() : null;
  const visibleTabs = getVisibleAdminDomains({ tier, isEvp });
  const legacy = requestedTab ? LEGACY_TAB_MAP[requestedTab] ?? null : null;
  const candidateTab = legacy?.tab ?? requestedTab;

  if (!candidateTab || !visibleTabs.includes(candidateTab)) {
    const fallback = getDefaultAdminLocation({ tier, isEvp });
    return {
      tab: fallback.tab,
      section: fallback.section,
      requestedTab,
      requestedSection,
    };
  }

  const allowedSections = SECTION_OPTIONS[candidateTab] ?? [];
  const candidateSection = legacy?.section ?? requestedSection;
  const resolvedSection = allowedSections.includes(candidateSection)
    ? candidateSection
    : SECTION_DEFAULTS[candidateTab] ?? allowedSections[0] ?? "upcoming";

  return {
    tab: candidateTab,
    section: resolvedSection,
    requestedTab,
    requestedSection,
  };
}

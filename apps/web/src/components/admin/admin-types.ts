export type AdminTier = "full" | "partial" | "read-only";

export type AdminDomainId = "people" | "office_hours" | "communications" | "meetings";

export type AdminStatusTone = "critical" | "warning" | "neutral" | "good";

export type AdminStatusIconName = "triangle" | "clock" | "dot" | "check";

export type AdminSubsectionId =
  | "invites"
  | "assignments"
  | "terms"
  | "audit"
  | "summary"
  | "queue"
  | "create"
  | "upcoming"
  | "committees"
  | "existing";

export type AdminNavItem = {
  id: string;
  label: string;
  href: string;
  badge?: string | null;
};

export type AdminSectionNavItem = {
  id: string;
  label: string;
  href: string;
};

export type AdminDomainMeta = {
  id: AdminDomainId;
  label: string;
  description: string;
  href?: string;
  badge?: string | null;
  disabled?: boolean;
};

export type AdminStat = {
  id: string;
  label: string;
  value: string;
  detail?: string | null;
  tone?: "default" | "positive" | "warning" | "critical" | "neutral" | "good";
};

export type AdminCardMetric = {
  label: string;
  value: string;
  tone?: "default" | "positive" | "warning" | "critical" | "neutral" | "good";
};

export type AdminHomeCard = {
  id: AdminDomainId;
  href: string;
  title: string;
  status: string;
  statusShort: string;
  statusTone: AdminStatusTone;
  statusIcon: AdminStatusIconName;
  count: number;
  description?: string | null;
  badge?: string | null;
  primaryLabel?: string;
};

export type AdminIssueItem = {
  id: string;
  domainId: AdminDomainId;
  href: string;
  label: string;
  count: number;
  statusTone: AdminStatusTone;
  statusIcon: AdminStatusIconName;
  priority: number;
};

export type AdminTier = "full" | "partial" | "read-only";

export type AdminDomainId = "people" | "office_hours" | "meetings";

export type AdminSubsectionId =
  | "invites"
  | "assignments"
  | "terms"
  | "audit"
  | "summary"
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
  tone?: "default" | "positive" | "warning";
};

export type AdminCardMetric = {
  label: string;
  value: string;
  tone?: "default" | "positive" | "warning";
};

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

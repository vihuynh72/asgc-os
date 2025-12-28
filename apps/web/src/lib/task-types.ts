export type TaskPriority = "low" | "medium" | "high";

export type TaskPrefill = {
  title?: string;
  description?: string;
  committeeId?: string;
  priority?: TaskPriority | "";
  due?: string;
  assigneeId?: string;
  source?: string;
};

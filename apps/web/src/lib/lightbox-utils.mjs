export function shouldCloseOnBackdrop({ target, currentTarget }) {
  if (!target || !currentTarget) return false;
  if (target === currentTarget) return true;
  const dataset = typeof target === "object" && target ? target.dataset : null;
  return dataset?.backdrop === "true";
}

export const DESIGN_COOKIE_NAME = "asgc_design";
export const DESIGN_PARAM_NAME = "design";

export function normalizeDesign(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "v1" || normalized === "v2") return normalized;
  return null;
}

export function coerceDefaultDesign(value) {
  return normalizeDesign(value) === "v1" ? "v1" : "v2";
}

export function getEffectiveDesign({ cookieValue, defaultDesign }) {
  return normalizeDesign(cookieValue) ?? coerceDefaultDesign(defaultDesign);
}

export function stripDesignParam(input) {
  const url = input instanceof URL ? new URL(input.toString()) : new URL(input);
  url.searchParams.delete(DESIGN_PARAM_NAME);
  return url.toString();
}


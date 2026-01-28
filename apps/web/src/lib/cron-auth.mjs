function getHeader(headers, name) {
  if (typeof headers !== "object" || headers === null) return null;

  if (typeof headers.get === "function") {
    const v = headers.get(name);
    return typeof v === "string" && v.length > 0 ? v : null;
  }

  const lower = String(name).toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() !== lower) continue;
    return typeof v === "string" && v.length > 0 ? v : null;
  }
  return null;
}

export function isAuthorizedCronRequest(headers, { cronSecret }) {
  if (typeof cronSecret !== "string") return false;
  const normalizedSecret = cronSecret.trim();
  if (normalizedSecret.length === 0) return false;

  const authHeader = getHeader(headers, "authorization");
  if (typeof authHeader === "string") {
    const match = authHeader.match(/^\s*Bearer\s+(.+?)\s*$/i);
    if (match?.[1] === normalizedSecret) return true;
  }

  // Back-compat: older deployments used a custom header.
  const legacy = getHeader(headers, "x-cron-secret");
  return typeof legacy === "string" && legacy.trim() === normalizedSecret;
}

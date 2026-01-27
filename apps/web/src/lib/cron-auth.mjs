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
  if (typeof cronSecret !== "string" || cronSecret.length === 0) return false;

  const authHeader = getHeader(headers, "authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;

  // Back-compat: older deployments used a custom header.
  const legacy = getHeader(headers, "x-cron-secret");
  return legacy === cronSecret;
}

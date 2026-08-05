export function getFileExtFromPath(path) {
  const last = typeof path === "string" ? path.split("/").pop() ?? "" : "";
  const idx = last.lastIndexOf(".");
  if (idx <= 0) return null;
  const ext = last.slice(idx + 1).toLowerCase();
  return ext || null;
}

export function buildKioskPhotoQuarantinePath({
  userId,
  checkinAtIso,
  sessionId,
  ext,
}) {
  if (!userId || !sessionId || !checkinAtIso || !ext) throw new Error("invalid_quarantine_path_args");
  const safeExt = String(ext).toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!safeExt) throw new Error("invalid_quarantine_path_args");
  const stamp = String(checkinAtIso).replace(/[:.]/g, "-");
  return `kiosk-quarantine/${userId}/${stamp}-${sessionId}.${safeExt}`;
}

export function getKioskPhotoDeletedAtFilter(mode) {
  return mode === "quarantine" ? "not.is" : "is";
}

function isActive(pathname, href) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getActiveNavKey(pathname, primaryHrefs, moreActive) {
  const safePathname = typeof pathname === "string" && pathname.length ? pathname : "/";
  const hrefs = Array.isArray(primaryHrefs) ? primaryHrefs : [];

  for (const href of hrefs) {
    if (typeof href !== "string") continue;
    if (isActive(safePathname, href)) return href;
  }

  return moreActive ? "more" : null;
}


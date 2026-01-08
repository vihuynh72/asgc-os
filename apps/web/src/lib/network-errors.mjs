export function isProbablyNetworkError(error) {
  if (!error) return false;
  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" && "message" in error
        ? error.message
        : "";
  const normalized = String(message).toLowerCase();
  return (
    normalized.includes("failed to fetch") ||
    normalized.includes("fetch failed") ||
    normalized.includes("networkerror")
  );
}

export async function swallowNetworkError(fn) {
  try {
    return await fn();
  } catch (error) {
    if (isProbablyNetworkError(error)) return null;
    throw error;
  }
}


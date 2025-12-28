export async function copyTextWithFallback(
  text: string,
  options?: { promptLabel?: string },
): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to prompt fallback.
    }
  }

  if (typeof window !== "undefined") {
    const label = options?.promptLabel ?? "Copy to clipboard:";
    window.prompt(label, text);
  }

  return false;
}

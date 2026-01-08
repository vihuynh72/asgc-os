export async function createSignedUrlWithFallback({ primary, fallback, bucket, path, expiresIn = 3600 }) {
  const safeBucket = typeof bucket === "string" ? bucket.trim() : "";
  const safePath = typeof path === "string" ? path.trim() : "";

  if (!safeBucket || !safePath) return null;

  const safeExpiresIn = Number.isFinite(expiresIn) ? Math.max(1, Math.floor(expiresIn)) : 3600;

  const tryCreate = async (client) => {
    if (!client || typeof client.from !== "function") return null;
    try {
      const { data, error } = await client.from(safeBucket).createSignedUrl(safePath, safeExpiresIn);
      if (error) return null;
      return data?.signedUrl ?? null;
    } catch {
      return null;
    }
  };

  const primaryUrl = await tryCreate(primary);
  if (primaryUrl) return primaryUrl;
  return await tryCreate(fallback);
}


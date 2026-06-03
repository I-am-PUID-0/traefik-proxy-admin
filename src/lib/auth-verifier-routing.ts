export function isDirectVerifierRequest(originalUri: string, forwardedUri: string | null) {
  if (forwardedUri) return false;

  try {
    const url = new URL(originalUri || "/", "https://example.invalid");
    return url.pathname.startsWith("/api/auth/verify");
  } catch {
    return true;
  }
}

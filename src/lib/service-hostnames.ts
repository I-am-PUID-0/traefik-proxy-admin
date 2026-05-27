export function parseCustomHostnamesInput(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => parseCustomHostnamesInput(item))
      .map((hostname) => hostname.trim())
      .filter(Boolean);
  }

  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed !== value) {
      return parseCustomHostnamesInput(parsed);
    }
  } catch {
    // Plain text list, not JSON.
  }

  return trimmed
    .split(/[\n,]+/)
    .map((hostname) => hostname.trim())
    .filter(Boolean);
}

export function customHostnamesJsonOrNull(value: unknown): string | null {
  const hostnames = parseCustomHostnamesInput(value);
  return hostnames.length > 0 ? JSON.stringify(hostnames) : null;
}

export function parseMiddlewareNames(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => parseMiddlewareNames(item))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed !== value) {
      return parseMiddlewareNames(parsed);
    }
  } catch {
    // Plain middleware text, not JSON.
  }

  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatMiddlewareNames(value: unknown): string {
  return parseMiddlewareNames(value).join(", ");
}

import type { Domain, Service } from "@/lib/db/schema";

type ServiceHostnameFields = Pick<Service, "hostnameMode" | "subdomain" | "customHostnames">;
type DomainHostnameFields = Pick<Domain, "domain">;

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

export function getServiceHostnames(
  service: ServiceHostnameFields,
  domain: DomainHostnameFields,
): string[] {
  switch (service.hostnameMode) {
    case "subdomain":
      return service.subdomain ? [`${service.subdomain}.${domain.domain}`] : [];
    case "apex":
      return [domain.domain];
    case "custom":
      return parseCustomHostnamesInput(service.customHostnames);
    default:
      return [];
  }
}

export function getPrimaryServiceHostname(
  service: ServiceHostnameFields,
  domain: DomainHostnameFields,
): string | null {
  return getServiceHostnames(service, domain)[0] ?? null;
}

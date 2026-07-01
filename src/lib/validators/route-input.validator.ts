import { isIP } from "node:net";
import type { CertificateConfig } from "@/lib/dto/domain.dto";
import type { CreateServiceData, UpdateServiceData } from "@/lib/dto/service.dto";
import { parseCustomHostnamesInput } from "@/lib/service-hostnames";

const HOSTNAME_MAX_LENGTH = 253;
const HOST_LABEL_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const TRAEFIK_NAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9_.-]{0,254})?$/;

export class RouteInputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouteInputValidationError";
  }
}

function invalid(message: string): never {
  throw new RouteInputValidationError(message);
}

function normalizedString(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function hasOuterWhitespace(value: string | null | undefined) {
  return typeof value === "string" && value !== value.trim();
}

function parseCertificateConfigInput(value: unknown): CertificateConfig[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as CertificateConfig[];
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as CertificateConfig[] : [];
  } catch {
    return [];
  }
}

export function isValidHostname(value: string | null | undefined): boolean {
  if (hasOuterWhitespace(value)) return false;
  const hostname = normalizedString(value);
  if (!hostname || hostname.length > HOSTNAME_MAX_LENGTH) return false;
  if (hostname.includes("://") || hostname.includes("/") || hostname.includes("*")) return false;

  return hostname
    .split(".")
    .every((label) => HOST_LABEL_RE.test(label));
}

export function isValidSubdomain(value: string | null | undefined): boolean {
  if (hasOuterWhitespace(value)) return false;
  const subdomain = normalizedString(value);
  return HOST_LABEL_RE.test(subdomain);
}

export function isValidTraefikName(value: string | null | undefined): boolean {
  if (hasOuterWhitespace(value)) return false;
  const name = normalizedString(value);
  return !name || TRAEFIK_NAME_RE.test(name);
}

export function isValidTargetHost(value: string | null | undefined): boolean {
  if (hasOuterWhitespace(value)) return false;
  const host = normalizedString(value);
  if (!host || host.length > HOSTNAME_MAX_LENGTH) return false;
  return Boolean(isIP(host)) || isValidHostname(host);
}

export function isValidTargetPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535;
}

export function validateCertificateConfigs(configs: CertificateConfig[] = []): void {
  for (const config of configs) {
    if (!isValidHostname(config.main)) {
      invalid(`Invalid certificate domain: ${config.main}`);
    }

    for (const san of config.sans ?? []) {
      if (!isValidHostname(san)) {
        invalid(`Invalid certificate SAN: ${san}`);
      }
    }

    if (!isValidTraefikName(config.certResolver)) {
      invalid(`Invalid certificate resolver: ${config.certResolver}`);
    }
  }
}

export function validateDomainRoutingInput(data: {
  domain: string;
  certResolver?: string | null;
  certificateConfigs?: CertificateConfig[] | string | null;
}): void {
  if (!isValidHostname(data.domain)) {
    invalid(`Invalid domain: ${data.domain}`);
  }

  if (!isValidTraefikName(data.certResolver)) {
    invalid(`Invalid certificate resolver: ${data.certResolver}`);
  }

  validateCertificateConfigs(parseCertificateConfigInput(data.certificateConfigs));
}

export function validateServiceRoutingInput(data: CreateServiceData | UpdateServiceData): void {
  if (!["subdomain", "apex", "custom"].includes(data.hostnameMode)) {
    invalid("Hostname mode must be subdomain, apex, or custom");
  }

  if (data.hostnameMode === "subdomain") {
    if (!data.subdomain) {
      invalid("Subdomain is required when hostname mode is 'subdomain'");
    }
    if (!isValidSubdomain(data.subdomain)) {
      invalid(`Invalid subdomain: ${data.subdomain}`);
    }
  }

  if (data.hostnameMode === "custom") {
    const hostnames = parseCustomHostnamesInput(data.customHostnames);
    if (hostnames.length === 0) {
      invalid("At least one hostname is required when hostname mode is 'custom'");
    }

    for (const hostname of hostnames) {
      if (!isValidHostname(hostname)) {
        invalid(`Invalid hostname format: ${hostname}`);
      }
    }
  }

  if (!isValidTargetHost(data.targetIp)) {
    invalid(`Invalid target host: ${data.targetIp}`);
  }

  if (!isValidTargetPort(data.targetPort)) {
    invalid("Target port must be an integer from 1 to 65535");
  }

  if (!isValidTraefikName(data.entrypoint)) {
    invalid(`Invalid entrypoint: ${data.entrypoint}`);
  }
}

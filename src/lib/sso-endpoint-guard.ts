import dns from "node:dns/promises";
import net from "node:net";

function splitList(value: string | undefined) {
  return value?.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean) ?? [];
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("ff")
  );
}

function isPrivateAddress(address: string) {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

function allowedPrivateHosts() {
  return splitList(process.env.SSO_ENDPOINT_ALLOW_HOSTS);
}

function isHostAllowedForPrivateResolution(hostname: string) {
  const normalized = hostname.toLowerCase();
  return allowedPrivateHosts().includes(normalized);
}

export async function assertSsoEndpointAllowed(rawUrl: string) {
  const parsed = new URL(rawUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("SSO endpoint must use http or https");
  }
  if (parsed.username || parsed.password) {
    throw new Error("SSO endpoint must not include embedded credentials");
  }

  const hostname = parsed.hostname.toLowerCase();
  const literalFamily = net.isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname }]
    : await dns.lookup(hostname, { all: true, verbatim: true });

  if (addresses.length === 0) {
    throw new Error("SSO endpoint hostname did not resolve");
  }

  const hasPrivateAddress = addresses.some((entry) => isPrivateAddress(entry.address));
  if (hasPrivateAddress && !isHostAllowedForPrivateResolution(hostname)) {
    throw new Error("SSO endpoint resolves to a private, local, or reserved address. Add the hostname to SSO_ENDPOINT_ALLOW_HOSTS if this is intentional.");
  }

  return parsed.toString();
}

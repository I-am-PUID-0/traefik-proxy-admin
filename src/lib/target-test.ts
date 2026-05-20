import "server-only";
import dns from "node:dns/promises";
import net from "node:net";

export interface TargetTestResult {
  target: string;
  reachable: boolean;
  durationMs: number;
  error?: string;
}

interface CidrRange {
  family: 4 | 6;
  address: bigint;
  prefix: number;
}

const DEV_DEFAULT_ALLOW_CIDRS = [
  "127.0.0.0/8",
  "::1/128",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "169.254.0.0/16",
  "fc00::/7",
  "fe80::/10",
];

function ipToBigInt(address: string): bigint | null {
  const family = net.isIP(address);

  if (family === 4) {
    return address
      .split(".")
      .reduce((value, octet) => (value << BigInt(8)) + BigInt(Number(octet)), BigInt(0));
  }

  if (family !== 6) {
    return null;
  }

  const [head = "", tail = ""] = address.toLowerCase().split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missingParts = 8 - headParts.length - tailParts.length;

  if (missingParts < 0) {
    return null;
  }

  const parts = [
    ...headParts,
    ...Array.from({ length: missingParts }, () => "0"),
    ...tailParts,
  ];

  if (parts.length !== 8) {
    return null;
  }

  return parts.reduce((value, part) => {
    const parsed = Number.parseInt(part || "0", 16);
    return (value << BigInt(16)) + BigInt(parsed);
  }, BigInt(0));
}

function parseCidr(cidr: string): CidrRange | null {
  const [rawAddress, rawPrefix] = cidr.trim().split("/");
  const parsedFamily = net.isIP(rawAddress);

  if (!parsedFamily) {
    return null;
  }

  const family = parsedFamily as 4 | 6;
  const maxPrefix = family === 4 ? 32 : 128;
  const prefix = rawPrefix === undefined ? maxPrefix : Number(rawPrefix);
  const address = ipToBigInt(rawAddress);

  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix || address === null) {
    return null;
  }

  return { family, address, prefix };
}

function getTargetTestAllowCidrs(): CidrRange[] {
  const configured = process.env.TARGET_TEST_ALLOW_CIDRS;
  const cidrs = configured?.trim()
    ? configured.split(",")
    : process.env.NODE_ENV === "production"
      ? []
      : DEV_DEFAULT_ALLOW_CIDRS;

  return cidrs
    .map((cidr) => parseCidr(cidr))
    .filter((range): range is CidrRange => range !== null);
}

function isAddressAllowed(address: string, ranges: CidrRange[]): boolean {
  const family = net.isIP(address);
  const value = ipToBigInt(address);

  if (!family || value === null) {
    return false;
  }

  const bits = family === 4 ? 32 : 128;

  return ranges.some((range) => {
    if (range.family !== family) {
      return false;
    }

    const shift = BigInt(bits - range.prefix);
    return (value >> shift) === (range.address >> shift);
  });
}

async function resolveAllowedTarget(host: string): Promise<{ address: string; error?: string }> {
  const allowCidrs = getTargetTestAllowCidrs();

  if (allowCidrs.length === 0) {
    return {
      address: "",
      error: "Target reachability testing is disabled. Set TARGET_TEST_ALLOW_CIDRS to enable it.",
    };
  }

  if (net.isIP(host)) {
    return isAddressAllowed(host, allowCidrs)
      ? { address: host }
      : { address: "", error: "Target address is outside the allowed test ranges" };
  }

  if (!/^[a-zA-Z0-9.-]{1,253}$/.test(host)) {
    return { address: "", error: "Target host must be an IP address or hostname" };
  }

  try {
    const addresses = await dns.lookup(host, { all: true, verbatim: true });
    const allowedAddress = addresses.find((entry) => isAddressAllowed(entry.address, allowCidrs));

    return allowedAddress
      ? { address: allowedAddress.address }
      : { address: "", error: "Resolved target address is outside the allowed test ranges" };
  } catch {
    return { address: "", error: "Target host could not be resolved" };
  }
}

export async function testTcpConnection(host: string, port: number, timeoutMs = 3000): Promise<TargetTestResult> {
  const startedAt = Date.now();
  const target = `${host}:${port}`;
  const resolvedTarget = await resolveAllowedTarget(host);

  if (resolvedTarget.error) {
    return {
      target,
      reachable: false,
      durationMs: Date.now() - startedAt,
      error: resolvedTarget.error,
    };
  }

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const settle = (reachable: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        target,
        reachable,
        durationMs: Date.now() - startedAt,
        error,
      });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false, `Connection timed out after ${timeoutMs}ms`));
    socket.once("error", (error) => settle(false, error.message));
    socket.connect(port, resolvedTarget.address);
  });
}

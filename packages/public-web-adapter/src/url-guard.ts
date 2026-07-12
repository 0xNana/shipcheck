import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export type AddressResolver = (
  hostname: string,
) => Promise<readonly ResolvedAddress[]>;

export type UrlPolicyErrorCode =
  | "INVALID_URL"
  | "CREDENTIALS_NOT_ALLOWED"
  | "SCHEME_NOT_ALLOWED"
  | "PORT_NOT_ALLOWED"
  | "IP_LITERAL_NOT_ALLOWED"
  | "DNS_RESOLUTION_FAILED"
  | "BLOCKED_ADDRESS"
  | "FIXTURE_URL_NOT_ALLOWED";

export class UrlPolicyError extends Error {
  constructor(
    readonly code: UrlPolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "UrlPolicyError";
  }
}

export interface ValidatedUrl {
  readonly normalizedUrl: string;
  readonly hostname: string;
  readonly addresses: readonly ResolvedAddress[];
}

const blockedAddresses = new BlockList();

const blockedIpv4Subnets: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const blockedIpv6Subnets: ReadonlyArray<readonly [string, number]> = [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001:2::", 48],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
];

for (const [address, prefix] of blockedIpv4Subnets) {
  blockedAddresses.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of blockedIpv6Subnets) {
  blockedAddresses.addSubnet(address, prefix, "ipv6");
}

// Node documents `{ all: true, verbatim: true }` for retaining every OS lookup
// result: https://nodejs.org/api/dns.html#dnspromiseslookuphostname-options
const defaultResolver: AddressResolver = async (hostname) => {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map(({ address, family }) => {
    if (family !== 4 && family !== 6) {
      throw new TypeError("DNS lookup returned an unsupported address family");
    }
    return { address, family };
  });
};

function unbracketHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function addressIsBlocked({ address, family }: ResolvedAddress): boolean {
  if (isIP(address) !== family) return true;
  // Node's BlockList handles IPv4-mapped IPv6 notation against IPv4 rules:
  // https://nodejs.org/api/net.html#blocklistcheckaddress-type
  return blockedAddresses.check(address, family === 4 ? "ipv4" : "ipv6");
}

function parseUrl(rawUrl: string): URL {
  try {
    // The WHATWG URL parser normalizes IDNs and is the Node-recommended parser
    // for untrusted input: https://nodejs.org/api/url.html#the-whatwg-url-api
    return new URL(rawUrl);
  } catch {
    throw new UrlPolicyError("INVALID_URL", "Destination URL is invalid");
  }
}

export class ProductionUrlGuard {
  constructor(private readonly resolver: AddressResolver = defaultResolver) {}

  async validate(rawUrl: string): Promise<ValidatedUrl> {
    const url = parseUrl(rawUrl);
    if (url.username !== "" || url.password !== "") {
      throw new UrlPolicyError(
        "CREDENTIALS_NOT_ALLOWED",
        "Destination URL credentials are not allowed",
      );
    }
    if (url.protocol !== "https:") {
      throw new UrlPolicyError(
        "SCHEME_NOT_ALLOWED",
        "Destination URL must use HTTPS",
      );
    }
    // WHATWG URL serializes the default HTTPS port as an empty string.
    if (url.port !== "") {
      throw new UrlPolicyError(
        "PORT_NOT_ALLOWED",
        "Destination URL must use port 443",
      );
    }

    const hostname = unbracketHostname(url.hostname);
    if (hostname === "") {
      throw new UrlPolicyError("INVALID_URL", "Destination hostname is missing");
    }
    if (isIP(hostname) !== 0) {
      throw new UrlPolicyError(
        "IP_LITERAL_NOT_ALLOWED",
        "Destination must use a DNS hostname",
      );
    }

    let addresses: readonly ResolvedAddress[];
    try {
      addresses = await this.resolver(hostname);
    } catch {
      throw new UrlPolicyError(
        "DNS_RESOLUTION_FAILED",
        "Destination hostname could not be resolved",
      );
    }
    if (addresses.length === 0) {
      throw new UrlPolicyError(
        "DNS_RESOLUTION_FAILED",
        "Destination hostname could not be resolved",
      );
    }
    if (addresses.some(addressIsBlocked)) {
      throw new UrlPolicyError(
        "BLOCKED_ADDRESS",
        "Destination resolves to a blocked network address",
      );
    }

    url.hash = "";
    return {
      normalizedUrl: url.toString(),
      hostname,
      addresses: addresses.map(({ address, family }) => ({ address, family })),
    };
  }

  validateRedirect(currentUrl: string, location: string): Promise<ValidatedUrl> {
    let destination: URL;
    try {
      destination = new URL(location, currentUrl);
    } catch {
      throw new UrlPolicyError("INVALID_URL", "Redirect URL is invalid");
    }
    return this.validate(destination.toString());
  }
}

export class FixtureUrlGuard {
  validate(rawUrl: string): Promise<ValidatedUrl> {
    return Promise.resolve().then(() => {
      const url = parseUrl(rawUrl);
      const hostname = unbracketHostname(url.hostname);
      if (
        url.protocol !== "http:" ||
        (hostname !== "127.0.0.1" && hostname !== "::1") ||
        url.username !== "" ||
        url.password !== ""
      ) {
        throw new UrlPolicyError(
          "FIXTURE_URL_NOT_ALLOWED",
          "Fixture URLs must use an HTTP loopback IP literal",
        );
      }
      url.hash = "";
      return {
        normalizedUrl: url.toString(),
        hostname,
        addresses: [
          { address: hostname, family: hostname === "::1" ? 6 : 4 },
        ],
      };
    });
  }

  validateRedirect(currentUrl: string, location: string): Promise<ValidatedUrl> {
    let destination: URL;
    try {
      destination = new URL(location, currentUrl);
    } catch {
      throw new UrlPolicyError("INVALID_URL", "Redirect URL is invalid");
    }
    return this.validate(destination.toString());
  }
}

export function createProductionUrlGuard(
  resolver: AddressResolver = defaultResolver,
): ProductionUrlGuard {
  return new ProductionUrlGuard(resolver);
}

export function createFixtureUrlGuard(): FixtureUrlGuard {
  return new FixtureUrlGuard();
}

export type UrlGuard = ProductionUrlGuard | FixtureUrlGuard;

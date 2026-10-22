/**
 * The origin check of FND-07 rule 3 and the source address of DEC-038. Both are
 * pure.
 */
import { BlockList, isIP } from "node:net";

/**
 * Whether the `Origin` of a state-changing request is the origin of
 * `PUBLIC_BASE_URL` (FND-07 rule 3). A missing `Origin`, and the text `null`,
 * are not allowed.
 */
export function isAllowedOrigin(origin: string | null, publicBaseUrl: string): boolean {
  if (origin === null) {
    return false;
  }
  try {
    return new URL(origin).origin === new URL(publicBaseUrl).origin;
  } catch {
    return false;
  }
}

function familyOf(address: string): "ipv4" | "ipv6" | null {
  const version = isIP(address);
  if (version === 4) {
    return "ipv4";
  }
  return version === 6 ? "ipv6" : null;
}

function buildTrustedList(trustedProxies: readonly string[]): BlockList {
  const list = new BlockList();
  for (const entry of trustedProxies) {
    const [address, prefix] = entry.split("/");
    const family = address === undefined ? null : familyOf(address);
    if (address === undefined || family === null) {
      continue;
    }
    if (prefix === undefined) {
      list.addAddress(address, family);
    } else {
      list.addSubnet(address, Number(prefix), family);
    }
  }
  return list;
}

/**
 * The source address of a request: the rightmost `X-Forwarded-For` entry that a
 * proxy in `trustedProxies` did not add (DEC-038). Never the leftmost entry.
 *
 * The connection address is the last hop. When it is not a trusted proxy, the
 * header came from the caller and is ignored.
 *
 * @returns `null` when no address is known, or when the entry found is not an
 * IP address.
 */
export function resolveSourceAddress(
  forwardedFor: string | null,
  connectionAddress: string | null,
  trustedProxies: readonly string[],
): string | null {
  if (connectionAddress === null) {
    return null;
  }
  return pickSource([...splitForwardedFor(forwardedFor), connectionAddress], trustedProxies);
}

/**
 * The source address of a request of a route handler or a server action (DEC-038).
 *
 * Next.js gives the code no socket address. It writes the address of the socket
 * into `X-Forwarded-For` when the header is absent, and it leaves a header that
 * is there. So the last entry of the header is the address that the last hop
 * wrote: the chain is the header alone, and the rule of `resolveSourceAddress`
 * applies to it. The deployment puts a trusted proxy before the app, and the
 * proxy appends the address of its caller (`TRUSTED_PROXIES`).
 *
 * @returns `null` when the header holds no address.
 */
export function resolveForwardedSource(forwardedFor: string | null, trustedProxies: readonly string[]): string | null {
  return pickSource(splitForwardedFor(forwardedFor), trustedProxies);
}

function splitForwardedFor(forwardedFor: string | null): string[] {
  return (forwardedFor ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

/** The rightmost entry of the chain that is not a trusted proxy. Never the leftmost entry, unless every hop is trusted. */
function pickSource(chain: readonly string[], trustedProxies: readonly string[]): string | null {
  const trusted = buildTrustedList(trustedProxies);
  const isTrusted = (address: string): boolean => {
    const family = familyOf(address);
    return family !== null && trusted.check(address, family);
  };
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const candidate = chain[index];
    if (candidate === undefined) {
      continue;
    }
    if (!isTrusted(candidate)) {
      return familyOf(candidate) === null ? null : candidate;
    }
  }
  // Every hop is a trusted proxy. The first hop is the nearest to the caller.
  const first = chain[0];
  return first !== undefined && familyOf(first) !== null ? first : null;
}

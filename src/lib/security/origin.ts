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
  const trusted = buildTrustedList(trustedProxies);
  const isTrusted = (address: string): boolean => {
    const family = familyOf(address);
    return family !== null && trusted.check(address, family);
  };

  const forwarded = (forwardedFor ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  const chain = [...forwarded, connectionAddress];

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

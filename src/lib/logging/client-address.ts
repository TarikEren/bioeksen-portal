/**
 * The part of a client address that a log record may keep (DEC-139, FND-05 rule
 * 5): the first three octets of an IPv4 address, or the first 48 bits of an IPv6
 * address. The full address lives only in the encrypted columns of the public
 * lookup (IFU-90).
 *
 * The result is never a full address, so a second pass over a truncated text
 * changes nothing: `203.0.113.x` has no fourth octet, and `2001:db8:1::/48` ends
 * in a prefix length.
 *
 * This file is pure.
 */
import { isIP } from "node:net";

/** A text that looks like an IPv4 address. `isIP` decides whether it is one. */
const IPV4_CANDIDATE = /(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?!\d|\.\d)/g;

/** A text that looks like an IPv6 address. `isIP` decides whether it is one. A truncated address ends in a prefix length and is left as it is. */
const IPV6_CANDIDATE = /(?<![\w:.])(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}(?![\w:.]|\/\d)/g;

const IPV6_HEXTETS = 8;
const PREFIX_HEXTETS = 3;

/** The eight 16-bit groups of an IPv6 address, or `null` when the text is not one. */
function ipv6Hextets(address: string): number[] | null {
  const withoutZone = address.split("%")[0] ?? "";
  let text = withoutZone;
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const octets = tail.split(".").map(Number);
    const [a = 0, b = 0, c = 0, d = 0] = octets;
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) {
    return null;
  }
  const head = halves[0] === "" || halves[0] === undefined ? [] : halves[0].split(":");
  const rest = halves[1];
  const back = rest === undefined || rest === "" ? [] : rest.split(":");
  const zeros = halves.length === 2 ? IPV6_HEXTETS - head.length - back.length : 0;
  const groups = [...head, ...Array<string>(Math.max(zeros, 0)).fill("0"), ...back].map((group) => Number.parseInt(group, 16));
  return groups.length === IPV6_HEXTETS && groups.every((group) => Number.isInteger(group)) ? groups : null;
}

/**
 * The part of one address that a log record keeps. A text that is not an IP
 * address comes back as `unknown`, so the caller never logs a value that it did
 * not check.
 */
export function truncateClientAddress(address: string): string {
  const family = isIP(address);
  if (family === 4) {
    return `${address.split(".").slice(0, 3).join(".")}.x`;
  }
  if (family === 6) {
    const groups = ipv6Hextets(address);
    if (groups !== null) {
      return `${groups.slice(0, PREFIX_HEXTETS).map((group) => group.toString(16)).join(":")}::/48`;
    }
  }
  return "unknown";
}

/** Replaces each full IP address in a text with its part (DEC-139). Text that holds no address stays as it is. */
export function truncateAddressesIn(text: string): string {
  return text
    .replace(IPV4_CANDIDATE, (candidate) => (isIP(candidate) === 4 ? truncateClientAddress(candidate) : candidate))
    .replace(IPV6_CANDIDATE, (candidate) => (candidate !== "::" && isIP(candidate) === 6 ? truncateClientAddress(candidate) : candidate));
}

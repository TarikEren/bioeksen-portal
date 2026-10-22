/**
 * What the public lookup reads from a request (IFU-50 rule 7, DEC-038, FND-08):
 * the `X-Forwarded-For` header for the source address, the `User-Agent`, and the
 * language cookie `bp_lang` for the language of the names in the answer. A route
 * handler and a server action both call it, so they give a service the same
 * `LookupMeta`.
 *
 * This file is pure. The value of a header is untrusted input: the services read
 * the source address with the rule of DEC-038 and never log the header.
 */
import { LANGUAGE_COOKIE, resolveLanguage } from "@/lib/i18n/languages";
import type { LookupMeta } from "@/lib/schemas/lookup";

/** The part of `Headers` that this file reads. A route and `headers()` of Next.js both have it. */
export interface HeaderSource {
  get(name: string): string | null;
}

/** The part of a cookie store that this file reads. */
export interface CookieSource {
  get(name: string): { readonly value: string } | undefined;
}

export function lookupMetaOf(headers: HeaderSource, cookies: CookieSource): LookupMeta {
  return {
    forwardedFor: headers.get("x-forwarded-for"),
    userAgent: headers.get("user-agent"),
    language: resolveLanguage({ userPreferred: null, cookie: cookies.get(LANGUAGE_COOKIE)?.value ?? null }),
  };
}

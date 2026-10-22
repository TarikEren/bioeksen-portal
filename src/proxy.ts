/**
 * The Next.js proxy (FND-07).
 *
 * Skeleton of stage B0: it does nothing. When built, it sets the Content
 * Security Policy with a new nonce for each HTML answer and the headers of
 * FND-07 rule 2. It is never an authorization layer (`sds-nextjs-backend` §3).
 */
import { NextResponse } from "next/server";

export function proxy(): NextResponse {
  return NextResponse.next();
}

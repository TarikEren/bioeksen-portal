/**
 * Field errors of the lookup page that name a field the person cannot see
 * (IFU-70.AC8, DEC-122).
 *
 * The server can name `noticeVersion` (IFU-50.AC5) and `verificationId`
 * (IFU-51.AC6). The page has no input for them, so `moveFieldErrors` shows their
 * text under the field that the person can act on: the consent box and the code
 * field. This file is pure.
 */

/** Moves the texts of the field `from` to the field `to`. The other fields stay as they are. */
export function moveFieldErrors(
  fields: Readonly<Record<string, readonly string[]>>,
  from: string,
  to: string,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [name, texts] of Object.entries(fields)) {
    if (name !== from) {
      result[name] = [...texts];
    }
  }
  const moved = fields[from];
  if (moved !== undefined) {
    result[to] = [...(result[to] ?? []), ...moved];
  }
  return result;
}

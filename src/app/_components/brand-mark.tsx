/**
 * The brand mark: a round avatar with the first letter of the app name (stage B1
 * UI table, mockup of the shell).
 *
 * It is a composition of the HeroUI `Avatar`. The letter comes from the app name
 * in the dictionary, so it is never copy of its own (`sds-nextjs-frontend` §6).
 * The mark is decoration: the name of the app is written beside it, so the avatar
 * is `aria-hidden`. A server component. The sidebar of the backoffice and the
 * header of the public pages both render it.
 */
import { Avatar } from "@heroui/react";

import { initialsOf } from "../_lib/initials";
import { getRequestText } from "../_lib/request";

export async function BrandMark() {
  const { language, text } = await getRequestText();

  return (
    <Avatar color="accent" aria-hidden="true">
      <Avatar.Fallback>{initialsOf([text.home.title], language)}</Avatar.Fallback>
    </Avatar>
  );
}

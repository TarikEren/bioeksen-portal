/**
 * The brand mark: a round avatar with the first letter of the app name (stage B1
 * UI table, mockup of the shell).
 *
 * It is a composition of the HeroUI `Avatar`. The letter comes from the app name
 * in the dictionary, so it is never copy of its own (`sds-nextjs-frontend` §6).
 * The mark is decoration: the name of the app is written beside it, so the avatar
 * is `aria-hidden`. A server component. The sidebar of the backoffice and the
 * header of the public pages both render it. The fallback takes the pair
 * `bg-theme-light` and `text-theme-darker` of the palette (6.81:1). The color prop
 * of the avatar would use the derived token `accent-soft-foreground`, which keeps
 * the color of the page inside `.sidebar-theme` and left the letter dark green on
 * dark green (R-062). `globals.css` stays as it is (DEC-015, FND-09 rule 1).
 */
import { Avatar } from "@heroui/react";

import { initialsOf } from "../_lib/initials";
import { getRequestText } from "../_lib/request";

export async function BrandMark() {
  const { language, text } = await getRequestText();

  return (
    <Avatar aria-hidden="true">
      <Avatar.Fallback className="bg-theme-light text-theme-darker">
        {initialsOf([text.home.title], language)}
      </Avatar.Fallback>
    </Avatar>
  );
}

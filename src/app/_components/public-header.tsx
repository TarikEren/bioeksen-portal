/**
 * The header of the public pages: the brand and the language switch (FND-08, stage
 * B1 UI table, mockup of the sign-in and the landing page).
 *
 * It is a composition: the brand mark, the app name and the language switch in
 * one row. The language switch stays on each page before sign-in, because the
 * first screen a person sees may come in the other language. A server component.
 */
import { Typography } from "@heroui/react";

import { getRequestText } from "../_lib/request";
import { BrandMark } from "./brand-mark";
import { LanguageControl } from "./language-control";

export async function PublicHeader() {
  const { text } = await getRequestText();

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <BrandMark />
        <Typography.Paragraph weight="semibold">{text.home.title}</Typography.Paragraph>
      </div>
      <LanguageControl />
    </header>
  );
}

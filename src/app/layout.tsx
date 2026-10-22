/**
 * The root layout (FND-08, FND-09).
 *
 * Skeleton of stage B0: a minimal shell. The frontend work of the stage sets
 * `<html lang>` from the session (B1) or the cookie `bp_lang`, else `tr`
 * (FND-08 rule 2), and loads the faces of DEC-016.
 */
import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Bioeksen Portal",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}

/**
 * The public lookup page `/eifu` (IFU-70, IFU-50, IFU-51, IFU-60, DEC-075,
 * DEC-097, DEC-098, FND-09, stage B4 UI table, mockup `EifuLookupPage`).
 *
 * A server component. It reads the dictionary of the active language and the
 * version of the consent text (`EIFU_LEGAL_NOTICE_VERSION`), and gives the client
 * flow only the text it shows and the failure labels of each step. The page needs
 * no session. The page is dynamic: it reads the language cookie (see the root
 * layout). Search engines do not index it (IFU-70 rule 6): the metadata has the
 * robots tag `noindex`, and the answer carries `X-Robots-Tag: noindex` (IFU-70.AC9,
 * set in `next.config.ts`). The page loads nothing from another host (FND-09.AC1).
 * The mockup has its own header and a modal for the consent text. This page uses
 * the public header and shows the full text in the form, because the specs ask for
 * the full text at the place of consent (IFU-70 rule 2).
 */
import { Typography } from "@heroui/react";
import type { Metadata } from "next";

import { PublicHeader } from "@/app/_components/public-header";
import { getRequestText } from "@/app/_lib/request";
import { getConfig } from "@/lib/config";

import { LookupFlow } from "./_components/lookup-flow";
import { lookupCopyOf } from "./_lib/lookup-copy";
import { lookupFailureLabels } from "./_lib/lookup-failure";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await getRequestText();
  return { title: text.lookup.title, robots: { index: false, follow: false } };
}

export default async function LookupPage() {
  const { text } = await getRequestText();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 p-6">
      <PublicHeader />
      <div className="flex min-w-0 flex-col gap-2">
        <Typography.Heading level={1} weight="semibold">
          {text.lookup.title}
        </Typography.Heading>
        <Typography.Paragraph color="muted">{text.lookup.intro}</Typography.Paragraph>
      </div>
      <LookupFlow
        copy={lookupCopyOf(text)}
        verifyFailure={lookupFailureLabels(text, "verify")}
        codeFailure={lookupFailureLabels(text, "code")}
        noticeVersion={getConfig().EIFU_LEGAL_NOTICE_VERSION}
      />
    </main>
  );
}

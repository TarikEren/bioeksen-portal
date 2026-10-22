"use client";

/**
 * The download links of a resolved lookup, one for each language (IFU-70 rule 4,
 * IFU-70.AC3, AC4, AC10, DEC-076).
 *
 * Each link is HeroUI's `Link` with a real `href`, so Tab reaches it and Enter
 * opens it. The accessible name holds the document type, the language name and
 * the word PDF (`result.fileLink`). The visible text is the same text, so the
 * name holds what the eye reads. The size follows the link, outside it. The
 * language name comes from the dictionary by the language code, and a code with no
 * name shows the code. `safeDownloadHref` lets only a relative, `http:` or
 * `https:` URL through. A file with a URL that fails the check shows its name with
 * no link. The links stay in the same tab: the server answers with an attachment
 * (IFU-60.AC13), so the browser downloads the file and the page stays. A client
 * component, because the size needs the active language.
 */
import { Link, Typography } from "@heroui/react";
import { useId } from "react";

import { formatFileSize } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/locale-provider";
import { fmt, textForCode } from "@/lib/i18n/messages";
import type { LookupFile } from "@/lib/schemas/lookup";

import { safeDownloadHref } from "../_lib/download-href";
import type { LookupCopy } from "../_lib/lookup-copy";

interface FileLinksProps {
  readonly copy: Pick<LookupCopy, "result" | "languages">;
  readonly files: readonly Pick<LookupFile, "languageCode" | "fileSizeBytes" | "downloadUrl">[];
}

export function FileLinks({ copy, files }: FileLinksProps) {
  const language = useLanguage();
  const headingId = useId();

  return (
    <div className="flex flex-col gap-2">
      <Typography.Heading level={3} weight="semibold" id={headingId}>
        {copy.result.files}
      </Typography.Heading>
      <ul aria-labelledby={headingId} className="flex flex-col gap-2">
        {files.map((file) => {
          const name = fmt(copy.result.fileLink, {
            type: copy.result.documentType,
            language: textForCode(copy.languages, file.languageCode, file.languageCode),
          });
          const href = safeDownloadHref(file.downloadUrl);
          return (
            <li key={file.languageCode} className="flex flex-wrap items-baseline gap-x-3">
              {href === null ? <span>{name}</span> : <Link href={href}>{name}</Link>}
              <span className="text-sm whitespace-nowrap text-muted">{formatFileSize(file.fileSizeBytes, language)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

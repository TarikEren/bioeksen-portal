/**
 * `GET /api/v1/catalog/lot-imports/template` downloads the import template, an
 * XLSX file in the active language (`catalog.lot.manage`, DEC-057, CAT-61.AC1).
 * The service builds the file with `exceljs` (DEC-055).
 */
import { requireActor } from "@/lib/auth/session";
import { defineMethodNotAllowed, defineRoute } from "@/lib/http";
import { getActiveLanguage } from "@/lib/i18n/server";
import { resolveSessionActor } from "@/modules/identity/current-actor";
import { importTemplate } from "@/modules/catalog/services/lot-import-service";

const XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const GET = defineRoute(
  { principal: "session", resolveSession: resolveSessionActor, permission: "catalog.lot.manage", allow: ["GET"] },
  async ({ actor }) => {
    const bytes = await importTemplate(requireActor(actor), await getActiveLanguage());
    return new Response(new Blob([bytes], { type: XLSX_MEDIA_TYPE }), {
      headers: {
        "Content-Type": XLSX_MEDIA_TYPE,
        "Content-Disposition": 'attachment; filename="lot-import-template.xlsx"',
      },
    });
  },
);

const OTHER_METHODS = { principal: "session", resolveSession: resolveSessionActor, allow: ["GET"] } as const;

export const POST = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);

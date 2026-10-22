/**
 * The input of a LOT import, from the fields of the form (DEC-054, CAT-60 rule
 * 12). The route handler and the server action of the import both call it, so
 * the two entries read the form in one way. The service never sees a `File`.
 */
import { AppError, CODE_MEANINGS } from "@/lib/errors";
import { IMPORT_BODY_LIMIT_BYTES, type ImportSource, type LotImportFields, type LotImportInput } from "@/lib/schemas/catalog";

/**
 * Reads the bytes of the file, or takes the pasted text.
 *
 * @throws AppError `VAL-4001` when the form has neither text nor file;
 * `VAL-4006` when it has both; `VAL-4550` when the input is over 5 MiB (a server
 * action has no wrapper that counts the body, so this check is the second guard
 * of DEC-051).
 */
export async function toLotImportInput(fields: LotImportFields): Promise<LotImportInput> {
  const text = fields.text !== undefined && fields.text.trim() !== "" ? fields.text : undefined;
  if (text === undefined && fields.file === undefined) {
    throw new AppError("VAL-4001", CODE_MEANINGS["VAL-4001"], {
      details: [{ field: "text", issue: "is required when the form has no file" }],
    });
  }
  if (text !== undefined && fields.file !== undefined) {
    throw new AppError("VAL-4006", CODE_MEANINGS["VAL-4006"], {
      details: [{ field: "file", issue: "cannot come with pasted text" }],
    });
  }

  let source: ImportSource;
  if (fields.file !== undefined) {
    if (fields.file.size > IMPORT_BODY_LIMIT_BYTES) {
      throw new AppError("VAL-4550", CODE_MEANINGS["VAL-4550"]);
    }
    source = { kind: "file", filename: fields.file.name === "" ? null : fields.file.name, bytes: new Uint8Array(await fields.file.arrayBuffer()) };
  } else {
    if (Buffer.byteLength(text ?? "", "utf8") > IMPORT_BODY_LIMIT_BYTES) {
      throw new AppError("VAL-4550", CODE_MEANINGS["VAL-4550"]);
    }
    source = { kind: "text", text: text ?? "" };
  }
  return { source, productId: fields.productId ?? null, catalogNumber: fields.catalogNumber ?? null };
}

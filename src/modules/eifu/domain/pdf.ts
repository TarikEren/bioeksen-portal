/**
 * The type of an uploaded file, read from its bytes (IFU-20 rule 2). The name of
 * the file and the type that the client declares tell nothing: a PDF has the
 * marker `%PDF-` at its start, and the server accepts only a PDF.
 *
 * This file is pure.
 */

/** The marker of a PDF file: `%PDF-`. */
const PDF_MARKER = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

/** Whether the bytes start with the marker of a PDF file. A file with no bytes is not a PDF. */
export function isPdf(bytes: Uint8Array): boolean {
  return bytes.byteLength >= PDF_MARKER.length && PDF_MARKER.every((value, index) => bytes[index] === value);
}

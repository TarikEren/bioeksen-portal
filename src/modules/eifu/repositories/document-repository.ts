/**
 * The table `eifu_document` (IFU-10). It holds queries and nothing else. It never
 * decides who may do what, and it never deletes a row: the triggers of the table
 * refuse DELETE and TRUNCATE (DEC-010). The trigger `document_product_is_settled`
 * refuses a new product after the first publication (IFU-10 rule 2).
 *
 * A function takes an `Executor`: the transaction of the service, or the client
 * for a read that needs none.
 */
import "server-only";

import { type Executor, fromColumnInstant, toColumnInstant } from "@/lib/db";
import type { DocumentTitle } from "@/lib/schemas/eifu";

import { type RowLock, toStoredTitle } from "./stored-values";

/** One document as the services read it. A time is an instant, and an id is the `bigint` key. */
export interface DocumentRow {
  readonly id: bigint;
  readonly documentNumber: string;
  readonly title: DocumentTitle;
  readonly productId: bigint;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewDocument {
  readonly documentNumber: string;
  readonly title: DocumentTitle;
  readonly productId: bigint;
  readonly now: Date;
}

/** The fields of a change. Each one is a full value: the service merges the patch (RFC 7396) before it calls. */
export interface DocumentChanges {
  readonly title: DocumentTitle;
  readonly productId: bigint;
  readonly now: Date;
}

interface StoredDocument {
  readonly id: bigint;
  readonly documentNumber: string;
  readonly title: unknown;
  readonly productId: bigint;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function toDocumentRow(row: StoredDocument): DocumentRow {
  return {
    id: row.id,
    documentNumber: row.documentNumber,
    title: toStoredTitle(row.title),
    productId: row.productId,
    createdAt: fromColumnInstant(row.createdAt),
    updatedAt: fromColumnInstant(row.updatedAt),
  };
}

/**
 * The document with the id, or `null`. `no-key-update` locks the row for a
 * publication, a withdrawal and a change of the product, so that they run one
 * after the other (IFU-30 rule 3, step 3). A lock needs a transaction.
 */
export async function findDocumentById(executor: Executor, id: bigint, lock: RowLock = "none"): Promise<DocumentRow | null> {
  const documents = executor.orm.public.EifuDocument.where({ id });
  const row = await (lock === "update"
    ? documents.forUpdate()
    : lock === "no-key-update"
      ? documents.forNoKeyUpdate()
      : lock === "share"
        ? documents.forShare()
        : documents
  ).first();
  return row === null ? null : toDocumentRow(row);
}

/** The documents with the ids, in the order of the ids. */
export async function findDocumentsByIds(executor: Executor, ids: readonly bigint[]): Promise<DocumentRow[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await executor.orm.public.EifuDocument.where((document) => document.id.in([...ids]))
    .orderBy((document) => document.id.asc())
    .all();
  return rows.map(toDocumentRow);
}

/**
 * The documents in the order of the document number and the id. `productId`
 * keeps the documents of one product, and `null` keeps all. The register is
 * small (an IFU for each product and format), so the service pages and searches
 * the result in memory: the search reads both titles, which sit in one `jsonb`
 * column.
 */
export async function listDocumentRows(executor: Executor, productId: bigint | null): Promise<DocumentRow[]> {
  const documents = executor.orm.public.EifuDocument;
  const filtered = productId === null ? documents.where((document) => document.id.gt(BigInt(0))) : documents.where({ productId });
  const rows = await filtered.orderBy([(document) => document.documentNumber.asc(), (document) => document.id.asc()]).all();
  return rows.map(toDocumentRow);
}

/** Inserts a document. A second row with the same number fails with `23505` on `document_number_unique` (IFU-10.AC2). */
export async function insertDocument(executor: Executor, document: NewDocument): Promise<DocumentRow> {
  const at = toColumnInstant(document.now);
  const row = await executor.orm.public.EifuDocument.create({
    documentNumber: document.documentNumber,
    documentType: "IFU",
    title: document.title,
    productId: document.productId,
    createdAt: at,
    updatedAt: at,
  });
  return toDocumentRow(row);
}

/** Writes the fields of a change. A new product after a publication fails on the trigger `document_product_is_settled`. */
export async function updateDocumentRow(executor: Executor, id: bigint, changes: DocumentChanges): Promise<void> {
  await executor.orm.public.EifuDocument.where({ id }).update({
    title: changes.title,
    productId: changes.productId,
    updatedAt: toColumnInstant(changes.now),
  });
}

/**
 * The Turkish dictionary: the source of the keys (FND-08 rule 1).
 *
 * `en.ts` takes its type from this file, so a key that is here and not in
 * `en.ts` fails `pnpm run typecheck` (FND-08.AC1). The text of a failure
 * follows DEC-122 and is added with the pages that show it.
 *
 * Stage B0 holds the keys of the contract and the text of a failed language
 * change (`common.language.failure`, `common.errorCode`, `common.callFailed`,
 * DEC-122).
 */
export const tr = {
  common: {
    language: {
      tr: "Türkçe",
      en: "English",
      switch: "Dil",
      failure: "Dil değiştirilemedi.",
    },
    errorCode: "Hata kodu",
    callFailed: "İşlem tamamlanamadı. Bağlantınızı kontrol edip yeniden deneyin.",
  },
  home: {
    title: "Bioeksen Portal",
  },
};

/** The shape of a dictionary: the keys of `tr`, with text values. */
export type Dictionary = DeepText<typeof tr>;

type DeepText<TSource> = {
  [TKey in keyof TSource]: TSource[TKey] extends string ? string : DeepText<TSource[TKey]>;
};

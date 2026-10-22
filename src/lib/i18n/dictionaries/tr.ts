/**
 * The Turkish dictionary: the source of the keys (FND-08 rule 1).
 *
 * `en.ts` takes its type from this file, so a key that is here and not in
 * `en.ts` fails `pnpm run typecheck` (FND-08.AC1). The text of a failure
 * follows DEC-122 and is added with the pages that show it.
 *
 * Stage B0 holds the keys of the contract and the text of a failed language
 * change (`common.language.failure`, `common.errorCode`, `common.errors`,
 * `common.callFailed`, DEC-122). `common.errors` is keyed by code and holds the
 * codes that a call of the pages so far can return; a code with no entry shows
 * the sentence of the call that failed. `common.errorCode` is a template: the
 * component fills `{code}` with `fmt`.
 */
export const tr = {
  common: {
    language: {
      tr: "Türkçe",
      en: "English",
      switch: "Dil",
      failure: "Dil değiştirilemedi.",
    },
    errorCode: "Hata kodu: {code}",
    errors: {
      "VAL-4001": "Gerekli bir değer eksik.",
      "VAL-4002": "Seçilen değer desteklenmiyor.",
      "SYS-5000": "Beklenmeyen bir hata oluştu.",
    },
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

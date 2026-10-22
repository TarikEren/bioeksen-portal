/**
 * The English dictionary (FND-08 rule 1). It is typed against `tr.ts`: a
 * missing key, and a key that `tr.ts` does not have, fail the type check.
 */
import type { Dictionary } from "./tr";

export const en: Dictionary = {
  common: {
    language: {
      tr: "Türkçe",
      en: "English",
      switch: "Language",
      failure: "The language could not be changed.",
    },
    errorCode: "Error code: {code}",
    errors: {
      "VAL-4001": "A required value is missing.",
      "VAL-4002": "The chosen value is not supported.",
      "SYS-5000": "An unexpected error occurred.",
    },
    callFailed: "The action could not be completed. Check your connection and try again.",
  },
  home: {
    title: "Bioeksen Portal",
  },
};

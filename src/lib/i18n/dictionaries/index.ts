import type { Language } from "../languages";
import { en } from "./en";
import { type Dictionary, tr } from "./tr";

export type { Dictionary } from "./tr";

/** The dictionary of each language. The type forces one entry for each language. */
export const dictionaries: Readonly<Record<Language, Dictionary>> = { tr, en };

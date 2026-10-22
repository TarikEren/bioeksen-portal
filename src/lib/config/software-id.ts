/**
 * The software id (DEC-021, `log-record.md`, **Allocating an id**).
 *
 * It is not configuration: the file `.bioeksen/software-id` holds it, and no
 * environment variable can change it (`sds-config`, **Not configuration**). The
 * configuration module reads it at start, so an app that has no id does not
 * report ready. Without the id the logger cannot write a record.
 */
import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { AppError } from "@/lib/errors";

const SOFTWARE_ID_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SOFTWARE_ID_MAX_LENGTH = 63;

/** The id of the working directory of the process, once read. */
let processSoftwareId: string | undefined;

/**
 * Reads the software id from the nearest `.bioeksen/software-id`, from
 * `startDirectory` up. The default is the working directory of the process.
 *
 * @throws AppError `CFG-5000` when no file holds an id, `CFG-5001` when the id
 * has a form that `log-record.md` does not allow.
 */
export function readSoftwareId(startDirectory?: string): string {
  if (startDirectory === undefined && processSoftwareId !== undefined) {
    return processSoftwareId;
  }
  let directory = startDirectory ?? process.cwd();
  for (;;) {
    const candidate = path.join(directory, ".bioeksen", "software-id");
    if (existsSync(candidate)) {
      const value = readFileSync(candidate, "utf8").trim();
      if (value === "") {
        break;
      }
      if (value.length > SOFTWARE_ID_MAX_LENGTH || !SOFTWARE_ID_FORMAT.test(value)) {
        throw new AppError("CFG-5001", "The software id has a form that is not allowed");
      }
      if (startDirectory === undefined) {
        processSoftwareId = value;
      }
      return value;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      break;
    }
    directory = parent;
  }
  throw new AppError("CFG-5000", "The software id is not supplied");
}

/**
 * The schemas and types of the identity API (stage B1 contract, ACC-10, ACC-11,
 * ACC-20, ACC-30, ACC-31).
 *
 * A zod schema is the one source of its type. The types of the answers are
 * schemas too, so the frontend and the services share one shape. An id is a
 * string in JSON, because the key is a `bigint` (DEC-009). A time is an RFC 3339
 * text with an offset.
 *
 * A request body is a strict object: an unknown field is 400 `VAL-4007`
 * (`sds-api-design`, **Unknown input**). The password rules of DEC-028 are not
 * in `SetPasswordInput`. The service checks them, so that `details` can name
 * each rule that a password breaks (ACC-10.AC5).
 *
 * This file is pure.
 */
import { z } from "zod";

import { AppError, CODE_MEANINGS, type FieldIssue } from "@/lib/errors";
import { LANGUAGES } from "@/lib/i18n/languages";

/** The permission registry of release 1 (ACC-30 rule 3). */
export const PERMISSION_CODES = [
  "catalog.product.view",
  "catalog.product.manage",
  "catalog.catalog_number.manage",
  "catalog.lot.view",
  "catalog.lot.manage",
  "catalog.lot.correct",
  "eifu.document.view",
  "eifu.document.manage",
  "eifu.document.publish",
  "eifu.document.withdraw",
  "eifu.document.replace_published_file",
  "eifu.lot_override.manage",
  "eifu.access_record.view_aggregated",
  "eifu.access_record.view_raw",
  "organization.users.view",
  "organization.users.manage",
  "iam.role.manage",
  "platform.system.administer",
] as const;

export const PermissionCode = z.enum(PERMISSION_CODES);
export type PermissionCode = z.infer<typeof PermissionCode>;

/** The roles of release 1 (ACC-30 rule 4). */
export const ROLE_CODES = ["IFU_MANAGER", "PLATFORM_ADMINISTRATOR"] as const;

export const RoleCode = z.enum(ROLE_CODES);
export type RoleCode = z.infer<typeof RoleCode>;

/** The preferred language of a user (DEC-017). */
export const PreferredLanguage = z.enum(LANGUAGES);

/** An id in a path or a body: a positive integer as text, 18 digits at most (DEC-009). */
export const EntityId = z.string().regex(/^[1-9][0-9]{0,17}$/);
export type EntityId = z.infer<typeof EntityId>;

const timestamp = z.iso.datetime({ offset: true });
const localizedName = z.strictObject({ tr: z.string(), en: z.string() });

/** The longest password that the app hashes. It also bounds the cost of `scrypt` (DEC-028, DEC-129). */
export const PASSWORD_MAX_LENGTH = 128;
/** The longest text that a password field accepts. A longer text breaks the length rule and is not hashed. */
const PASSWORD_FIELD_LIMIT = 1024;

// ---------------------------------------------------------------- requests

/** `POST sign-in` (ACC-20.AC1). */
export const SignInInput = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(1).max(PASSWORD_FIELD_LIMIT),
});
export type SignInInput = z.infer<typeof SignInInput>;

/** `POST users` (ACC-10.AC1). */
export const CreateUserInput = z.strictObject({
  email: z.email().max(254),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  preferredLanguage: PreferredLanguage,
});
export type CreateUserInput = z.infer<typeof CreateUserInput>;

/** `POST invitations/accept` and `POST password-resets/complete` (ACC-10.AC3, ACC-11.AC2). */
export const SetPasswordInput = z.strictObject({
  token: z.string().min(1).max(512),
  password: z.string().max(PASSWORD_FIELD_LIMIT),
});
export type SetPasswordInput = z.infer<typeof SetPasswordInput>;

/** `POST password-resets` (ACC-11.AC1). */
export const PasswordResetRequestInput = z.strictObject({ email: z.email().max(254) });
export type PasswordResetRequestInput = z.infer<typeof PasswordResetRequestInput>;

/** `POST users/{id}/role-assignments` (ACC-31.AC1). */
export const GrantRoleInput = z.strictObject({ roleCode: RoleCode });
export type GrantRoleInput = z.infer<typeof GrantRoleInput>;

/** `GET users`, after defaults (`sds-api-design`, **Lists**). */
export interface UserListQuery {
  readonly page: number;
  readonly limit: number;
  /** A search text for the email address and the names. `null` when the caller sent none. */
  readonly q: string | null;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
const MAX_QUERY_TEXT_LENGTH = 200;

/**
 * Reads the query string of `GET users`. An unknown parameter is ignored. A
 * `page` or `limit` that is not an integer is 400 `VAL-4003`. A `page` below 1,
 * or a `limit` outside 1 to 200, is 400 `VAL-4005`. A `q` that is too long is
 * 400 `VAL-4006`.
 *
 * @throws AppError `VAL-4003`, `VAL-4005`, `VAL-4006`.
 */
export function parseUserListQuery(params: URLSearchParams): UserListQuery {
  const entries: FieldIssue[] = [];
  const integerPattern = /^-?\d{1,15}$/;

  const readInteger = (name: string, fallback: number): number | null => {
    const raw = params.get(name);
    if (raw === null) {
      return fallback;
    }
    if (!integerPattern.test(raw)) {
      entries.push({ field: name, issue: "is not an integer" });
      return null;
    }
    return Number(raw);
  };

  const page = readInteger("page", DEFAULT_PAGE);
  const limit = readInteger("limit", DEFAULT_LIMIT);
  if (entries.length > 0) {
    throw new AppError("VAL-4003", CODE_MEANINGS["VAL-4003"], { details: entries });
  }

  const range: FieldIssue[] = [];
  if (page === null || page < 1) {
    range.push({ field: "page", issue: "is out of range" });
  }
  if (limit === null || limit < 1 || limit > MAX_LIMIT) {
    range.push({ field: "limit", issue: "is out of range" });
  }
  if (range.length > 0 || page === null || limit === null) {
    throw new AppError("VAL-4005", CODE_MEANINGS["VAL-4005"], { details: range });
  }

  const rawQuery = params.get("q")?.trim() ?? "";
  if (rawQuery.length > MAX_QUERY_TEXT_LENGTH) {
    throw new AppError("VAL-4006", CODE_MEANINGS["VAL-4006"], {
      details: [{ field: "q", issue: "is out of range" }],
    });
  }
  return { page, limit, q: rawQuery === "" ? null : rawQuery };
}

// --------------------------------------------------------------- responses

/** The signed-in user, with what the interface needs (`GET me`, `POST sign-in`). */
export const Me = z.strictObject({
  id: EntityId,
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  preferredLanguage: PreferredLanguage,
  /** The permissions of the active role assignments, sorted (ACC-30.AC4). */
  permissions: z.array(PermissionCode),
  roles: z.array(RoleCode),
});
export type Me = z.infer<typeof Me>;

/** A row of the user list. */
export const UserSummary = z.strictObject({
  id: EntityId,
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  preferredLanguage: PreferredLanguage,
  isActive: z.boolean(),
  createdAt: timestamp,
  /** The roles of the active assignments, for the list rows (ACC-30). */
  activeRoles: z.array(z.strictObject({ code: RoleCode, name: localizedName })),
});
export type UserSummary = z.infer<typeof UserSummary>;

/** One role assignment of a user (ACC-31). It stays when it is revoked, with `isActive` false (DEC-010). */
export const RoleAssignmentView = z.strictObject({
  id: EntityId,
  roleCode: RoleCode,
  roleName: localizedName,
  isActive: z.boolean(),
  grantedByUserId: EntityId.nullable(),
  grantedAt: timestamp,
  revokedAt: timestamp.nullable(),
});
export type RoleAssignmentView = z.infer<typeof RoleAssignmentView>;

/** One user with the active role assignments. It holds no hash and no token. */
export const UserDetail = UserSummary.extend({
  /** `false` while the person has not opened the invitation (ACC-10.AC1). */
  hasPassword: z.boolean(),
  updatedAt: timestamp,
  roles: z.array(RoleAssignmentView),
});
export type UserDetail = z.infer<typeof UserDetail>;

/** One role with its permissions (`GET roles`). */
export const RoleView = z.strictObject({
  code: RoleCode,
  name: localizedName,
  permissions: z.array(PermissionCode),
});
export type RoleView = z.infer<typeof RoleView>;

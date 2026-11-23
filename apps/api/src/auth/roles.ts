import { createAccessControl } from "better-auth/plugins/access"
import { defaultStatements } from "better-auth/plugins/organization/access"

/**
 * Office roles (RF-01). Only these two exist: better-auth's default `admin` and `member` are never
 * assignable (see the hooks in auth.ts). The owner manages the office, its members and
 * invitations; the accountant works on the office's data and manages nothing.
 */
export const OFFICE_ROLES = ["owner", "accountant"] as const
export type OfficeRole = (typeof OFFICE_ROLES)[number]

export function isOfficeRole(value: unknown): value is OfficeRole {
  return typeof value === "string" && (OFFICE_ROLES as readonly string[]).includes(value)
}

export const accessControl = createAccessControl(defaultStatements)

export const officeRoles = {
  owner: accessControl.newRole({
    organization: ["update"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
  }),
  accountant: accessControl.newRole({
    organization: [],
    member: [],
    invitation: [],
  }),
} satisfies Record<OfficeRole, unknown>

import type { OfficeRole } from "../auth/roles.js"

export interface MemberRole {
  id: string
  role: string
}

export type MemberChange = { kind: "remove" } | { kind: "role"; to: OfficeRole }

/**
 * True when the change would leave the office without an owner: removing or demoting its only
 * owner. better-auth checks part of this too; the API answers 409 before calling it.
 */
export function leavesNoOwner(
  members: readonly MemberRole[],
  targetId: string,
  change: MemberChange,
): boolean {
  const target = members.find((m) => m.id === targetId)
  if (target?.role !== "owner") return false
  if (change.kind === "role" && change.to === "owner") return false
  return members.filter((m) => m.role === "owner").length <= 1
}

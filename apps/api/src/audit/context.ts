import { AsyncLocalStorage } from "node:async_hooks"
import type { OFFICE_FIELDS } from "./events.js"

/**
 * Context of a request to better-auth, for the audit hooks in src/auth/auth.ts: better-auth hands
 * its hooks neither the request nor, for some actions, the user who acted.
 */
export interface AuthRequestContext {
  requestId: string
  /** Signed-in user, resolved before the action for the paths that need it (plugin.ts). */
  actorUserId: string | null
  /** Office fields of an `organization/update`, set by its before-hook. */
  officeFields?: (typeof OFFICE_FIELDS)[number][]
}

export const authRequestContext = new AsyncLocalStorage<AuthRequestContext>()

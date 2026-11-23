import { sql } from "drizzle-orm"
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres"
import pg from "pg"
import { z } from "zod"
import * as schema from "./schema.js"

type Drizzle = NodePgDatabase<typeof schema>

/** Transaction handed to `withOffice` callbacks: every query in it is scoped to one office. */
export type OfficeTx = Parameters<Parameters<Drizzle["transaction"]>[0]>[0]

/** Database handle. Opaque on purpose: there is no query path that skips withOffice(). */
export interface Db {
  /** Closes the pool (graceful shutdown, tests). */
  close(): Promise<void>
}

// Module-private: code outside this file reaches the query builder only through withOffice().
const handles = new WeakMap<Db, Drizzle>()

/**
 * Connects lazily as the application role (`DATABASE_URL`, a member of `trs_app`): no connection
 * is opened until the first query.
 */
export function createDb(connectionString: string, options: { max?: number } = {}): Db {
  const pool = new pg.Pool({ connectionString, max: options.max ?? 10 })
  const db: Db = { close: () => pool.end() }
  handles.set(db, drizzle({ client: pool, schema }))
  return db
}

const officeIdSchema = z.uuid()

/**
 * Runs `fn` in a transaction whose queries see and write only the rows of `officeId`. The id is
 * bound as a parameter of `set_config(..., true)` (the SQL form of SET LOCAL), so it ends with the
 * transaction and never leaks to the next user of the pooled connection.
 */
export async function withOffice<T>(
  db: Db,
  officeId: string,
  fn: (tx: OfficeTx) => Promise<T>,
): Promise<T> {
  const id = officeIdSchema.parse(officeId)
  const handle = handles.get(db)
  if (handle === undefined) throw new TypeError("Not a database created by createDb().")
  return await handle.transaction(async (tx) => {
    await tx.execute(sql`select pg_catalog.set_config('app.office_id', ${id}, true)`)
    return fn(tx)
  })
}

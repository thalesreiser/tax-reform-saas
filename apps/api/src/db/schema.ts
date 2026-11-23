import { char, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { authOrganizations } from "./auth-schema.js"

export * from "./auth-schema.js"

/*
 * Tenancy model (RNF-02): `offices` is the tenant root and every tenant-scoped table carries an
 * `office_id`. Row-level security is not declared here: it lives in hand-written SQL migrations
 * (see README "Database"), because drizzle-kit cannot express FORCE ROW LEVEL SECURITY or the
 * grants to the application role. Every table added here needs that migration too; the
 * integration suite fails if a table with `office_id` is missing it.
 */

/**
 * Accounting office: the tenant. Its id is the id of a better-auth organization; the row is created
 * and renamed by a trigger on `auth_organizations` in the same transaction (0003_auth_rls.sql).
 */
export const offices = pgTable("offices", {
  id: uuid("id")
    .primaryKey()
    .references(() => authOrganizations.id),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

/** Client company of an office (RF-02). BE-02.2 adds the CNPJ lookup fields. */
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    officeId: uuid("office_id")
      .notNull()
      .references(() => offices.id),
    /** 14 characters, no punctuation; alphanumeric CNPJs (from July 2026) fit as well. */
    cnpj: char("cnpj", { length: 14 }).notNull(),
    legalName: text("legal_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("clients_office_id_cnpj_key").on(t.officeId, t.cnpj)],
)

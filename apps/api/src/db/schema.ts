import { sql } from "drizzle-orm"
import {
  char,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
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

/** Postal address of a client, as the CNPJ registry gives it. */
export interface ClientAddress {
  street: string | null
  number: string | null
  complement: string | null
  district: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  ibgeCode: string | null
}

/** Client company of an office (RF-02). Registry fields come from the CNPJ lookup (BE-02.2). */
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
    tradeName: text("trade_name"),
    address: jsonb("address").$type<ClientAddress>(),
    /** CNAE subclass, 7 digits. */
    mainCnae: text("main_cnae"),
    secondaryCnaes: text("secondary_cnaes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    registrationStatus: text("registration_status"),
    /** `mei`, `simples_nacional` or `unknown`: only what the registry states. */
    taxRegime: text("tax_regime"),
    /** Provider of the registry fields (e.g. `brasilapi`) and when they were fetched. */
    lookupSource: text("lookup_source"),
    lookupFetchedAt: timestamp("lookup_fetched_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("clients_office_id_cnpj_key").on(t.officeId, t.cnpj),
    check("clients_cnpj_check", sql`${t.cnpj} ~ '^[0-9A-Z]{12}[0-9]{2}$'`),
  ],
)

/**
 * Audited actions (RF-18). Adding one: append it here (`db:generate` writes `ALTER TYPE ... ADD
 * VALUE`) and give it a metadata schema in src/audit/events.ts.
 */
export const AUDIT_ACTIONS = [
  "office.created",
  "office.updated",
  "member.invited",
  "member.invitation_canceled",
  "member.invitation_rejected",
  "member.joined",
  "member.role_changed",
  "member.removed",
  "member.left",
  "client.created",
  "client.updated",
  "client.deleted",
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const AUDIT_RESOURCE_TYPES = ["office", "invitation", "member", "client"] as const
export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPES)[number]

export const auditAction = pgEnum("audit_action", AUDIT_ACTIONS)
export const auditResourceType = pgEnum("audit_resource_type", AUDIT_RESOURCE_TYPES)

/**
 * Append-only audit log of an office (RF-18). Written only through `recordAudit()`; the API role
 * may insert and read, never update or delete, and a trigger rejects changes even for the owner
 * (0005_audit_events_rls.sql). `metadata` holds ids, roles and field names only, never personal or
 * fiscal data (allow-list per action in src/audit/events.ts). `actor_user_id` has no foreign key on
 * purpose: deleting a user must not rewrite the log.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    officeId: uuid("office_id")
      .notNull()
      .references(() => offices.id),
    /** NULL for actions taken by the system. */
    actorUserId: uuid("actor_user_id"),
    /** The actor's role in the office when the action happened, if it had one. */
    actorRole: text("actor_role"),
    action: auditAction("action").notNull(),
    resourceType: auditResourceType("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    /** Millisecond precision, so a JavaScript Date round-trips exactly (pagination cursor). */
    occurredAt: timestamp("occurred_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    /** `x-request-id` of the request that caused the action. */
    requestId: uuid("request_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    index("audit_events_office_id_occurred_at_idx").on(
      t.officeId,
      t.occurredAt.desc(),
      t.id.desc(),
    ),
    check(
      "audit_events_metadata_check",
      sql`jsonb_typeof(${t.metadata}) = 'object' and octet_length(${t.metadata}::text) <= 1024`,
    ),
  ],
)

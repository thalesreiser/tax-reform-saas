import { sql } from "drizzle-orm"
import {
  char,
  check,
  customType,
  index,
  integer,
  jsonb,
  numeric,
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
export const offices = pgTable(
  "offices",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authOrganizations.id),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Profile for reports and the share view (BE-02.1); all optional. CNPJ of the office itself. */
    cnpj: char("cnpj", { length: 14 }),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    /** `#RRGGBB`, upper-case. */
    brandColor: text("brand_color"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("offices_cnpj_check", sql`${t.cnpj} ~ '^[0-9A-Z]{12}[0-9]{2}$'`),
    check("offices_brand_color_check", sql`${t.brandColor} ~ '^#[0-9A-F]{6}$'`),
  ],
)

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" })

/** Maximum logo size, also a CHECK on the table (src/office/logo.ts validates the image). */
export const LOGO_MAX_BYTES = 200 * 1024

/**
 * Logo of an office (BE-02.1): PNG, JPEG or WebP only, validated before it is stored. Kept in
 * Postgres until there is an object storage provider (see README "Office").
 */
export const officeLogos = pgTable(
  "office_logos",
  {
    officeId: uuid("office_id")
      .primaryKey()
      .references(() => offices.id),
    contentType: text("content_type").notNull(),
    data: bytea("data").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** Hex SHA-256 of `data`: the ETag. */
    sha256: char("sha256", { length: 64 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "office_logos_content_type_check",
      sql`${t.contentType} in ('image/png', 'image/jpeg', 'image/webp')`,
    ),
    check(
      "office_logos_size_check",
      sql`octet_length(${t.data}) <= ${sql.raw(String(LOGO_MAX_BYTES))}`,
    ),
  ],
)

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

export const FISCAL_REGIMES = ["simples_nacional", "lucro_presumido", "lucro_real", "mei"] as const
export type FiscalRegime = (typeof FISCAL_REGIMES)[number]
export const SIMPLES_ANNEXES = ["I", "II", "III", "IV", "V"] as const
export const OPERATION_TYPES = ["goods", "services"] as const
export const DESTINATIONS = ["intrastate", "interstate"] as const
/** Input grouping only; which purchases give credit is decided by the simulation (MOT-03.2). */
export const PURCHASE_CATEGORIES = [
  "goods_for_resale",
  "inputs",
  "services",
  "energy",
  "rent",
  "freight",
  "fixed_assets",
  "other",
] as const

/** R$ amounts: numeric(15, 2), read and written as decimal strings (never JS numbers). */
const amount = (name: string) => numeric(name, { precision: 15, scale: 2 })
const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "))

/**
 * Fiscal profile of a client (RF-03, BE-02.3), 1:1 with `clients`. Every field may be empty while
 * the accountant fills it in; `profileCompleteness()` says what a simulation still needs. The
 * regime is the accountant's (`confirmed_by`/`confirmed_at`), not the registry's hint.
 * `version` is the optimistic-concurrency token (ETag / If-Match).
 */
export const clientFiscalProfiles = pgTable(
  "client_fiscal_profiles",
  {
    clientId: uuid("client_id")
      .primaryKey()
      .references(() => clients.id, { onDelete: "cascade" }),
    officeId: uuid("office_id")
      .notNull()
      .references(() => offices.id),
    regime: text("regime"),
    simplesAnnex: text("simples_annex"),
    /** Gross revenue of the last 12 months for the Simples bracket. */
    rbt12: amount("rbt12"),
    mainCnae: text("main_cnae"),
    secondaryCnaes: text("secondary_cnaes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    uf: char("uf", { length: 2 }),
    /** IBGE municipality code, 7 digits. */
    municipalityCode: char("municipality_code", { length: 7 }),
    revenue12m: amount("revenue_12m"),
    /** Payroll of the last 12 months (factor R), optional. */
    payroll12m: amount("payroll_12m"),
    confirmedBy: uuid("confirmed_by"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("client_fiscal_profiles_regime_check", sql`${t.regime} in (${inList(FISCAL_REGIMES)})`),
    check(
      "client_fiscal_profiles_municipality_code_check",
      sql`${t.municipalityCode} ~ '^[0-9]{7}$'`,
    ),
  ],
)

/** One line of the sales mix: an NCM (goods) or NBS (services), as a revenue share or amount. */
export const clientSalesMix = pgTable(
  "client_sales_mix",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    officeId: uuid("office_id")
      .notNull()
      .references(() => offices.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clientFiscalProfiles.clientId, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    operationType: text("operation_type").notNull(),
    ncm: text("ncm"),
    nbs: text("nbs"),
    description: text("description"),
    /** Percent of revenue, 4 places; or `amount`, never both. */
    sharePercent: numeric("share_percent", { precision: 7, scale: 4 }),
    amount: amount("amount"),
    cst: text("cst"),
    cClassTrib: text("c_class_trib"),
    destination: text("destination").notNull(),
  },
  (t) => [
    index("client_sales_mix_client_id_idx").on(t.clientId),
    check(
      "client_sales_mix_operation_type_check",
      sql`${t.operationType} in (${inList(OPERATION_TYPES)})`,
    ),
    check("client_sales_mix_destination_check", sql`${t.destination} in (${inList(DESTINATIONS)})`),
  ],
)

/** Purchases that may give credit, as an amount per category (last 12 months). */
export const clientCreditablePurchases = pgTable(
  "client_creditable_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    officeId: uuid("office_id")
      .notNull()
      .references(() => offices.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clientFiscalProfiles.clientId, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    category: text("category").notNull(),
    description: text("description"),
    amount: amount("amount").notNull(),
  },
  (t) => [
    index("client_creditable_purchases_client_id_idx").on(t.clientId),
    check(
      "client_creditable_purchases_category_check",
      sql`${t.category} in (${inList(PURCHASE_CATEGORIES)})`,
    ),
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
  "member.invitation_resent",
  "member.invitation_rejected",
  "member.joined",
  "member.role_changed",
  "member.removed",
  "member.left",
  "client.created",
  "client.updated",
  "client.deleted",
  "client.fiscal_profile_updated",
  "client.regime_confirmed",
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

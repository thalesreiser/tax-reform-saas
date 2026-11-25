ALTER TYPE "public"."audit_action" ADD VALUE 'client.fiscal_profile_updated';
--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'client.regime_confirmed';
--> statement-breakpoint
CREATE TABLE "client_creditable_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"office_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"amount" numeric(15, 2) NOT NULL,
	CONSTRAINT "client_creditable_purchases_category_check" CHECK ("client_creditable_purchases"."category" in ('goods_for_resale', 'inputs', 'services', 'energy', 'rent', 'freight', 'fixed_assets', 'other'))
);
--> statement-breakpoint
CREATE TABLE "client_fiscal_profiles" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"office_id" uuid NOT NULL,
	"regime" text,
	"simples_annex" text,
	"rbt12" numeric(15, 2),
	"main_cnae" text,
	"secondary_cnaes" text[] DEFAULT '{}'::text[] NOT NULL,
	"uf" char(2),
	"municipality_code" char(7),
	"revenue_12m" numeric(15, 2),
	"payroll_12m" numeric(15, 2),
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_fiscal_profiles_regime_check" CHECK ("client_fiscal_profiles"."regime" in ('simples_nacional', 'lucro_presumido', 'lucro_real', 'mei')),
	CONSTRAINT "client_fiscal_profiles_municipality_code_check" CHECK ("client_fiscal_profiles"."municipality_code" ~ '^[0-9]{7}$')
);
--> statement-breakpoint
CREATE TABLE "client_sales_mix" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"office_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"operation_type" text NOT NULL,
	"ncm" text,
	"nbs" text,
	"description" text,
	"share_percent" numeric(7, 4),
	"amount" numeric(15, 2),
	"cst" text,
	"c_class_trib" text,
	"destination" text NOT NULL,
	CONSTRAINT "client_sales_mix_operation_type_check" CHECK ("client_sales_mix"."operation_type" in ('goods', 'services')),
	CONSTRAINT "client_sales_mix_destination_check" CHECK ("client_sales_mix"."destination" in ('intrastate', 'interstate'))
);
--> statement-breakpoint
ALTER TABLE "client_creditable_purchases" ADD CONSTRAINT "client_creditable_purchases_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_creditable_purchases" ADD CONSTRAINT "client_creditable_purchases_client_id_client_fiscal_profiles_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_fiscal_profiles"("client_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_fiscal_profiles" ADD CONSTRAINT "client_fiscal_profiles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_fiscal_profiles" ADD CONSTRAINT "client_fiscal_profiles_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_sales_mix" ADD CONSTRAINT "client_sales_mix_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_sales_mix" ADD CONSTRAINT "client_sales_mix_client_id_client_fiscal_profiles_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_fiscal_profiles"("client_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "client_creditable_purchases_client_id_idx" ON "client_creditable_purchases" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX "client_sales_mix_client_id_idx" ON "client_sales_mix" USING btree ("client_id");

--> statement-breakpoint
-- Hand-written below (BE-02.3), like 0001_office_rls.sql: the profile and its lines belong to the
-- client's office. The routes read the client inside withOffice() before writing, so a profile is
-- never attached to another office's client id.
ALTER TABLE "client_fiscal_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "client_fiscal_profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "office_isolation" ON "client_fiscal_profiles"
  USING ("office_id" = public.app_current_office_id())
  WITH CHECK ("office_id" = public.app_current_office_id());
--> statement-breakpoint
ALTER TABLE "client_sales_mix" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "client_sales_mix" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "office_isolation" ON "client_sales_mix"
  USING ("office_id" = public.app_current_office_id())
  WITH CHECK ("office_id" = public.app_current_office_id());
--> statement-breakpoint
ALTER TABLE "client_creditable_purchases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "client_creditable_purchases" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "office_isolation" ON "client_creditable_purchases"
  USING ("office_id" = public.app_current_office_id())
  WITH CHECK ("office_id" = public.app_current_office_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "client_fiscal_profiles", "client_sales_mix", "client_creditable_purchases" TO trs_app;
--> statement-breakpoint
-- Like 0008_office_settings.sql: service_role bypasses row-level security, so no grant on tenant tables.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON "client_fiscal_profiles", "client_sales_mix", "client_creditable_purchases" FROM service_role;
  END IF;
END
$$;

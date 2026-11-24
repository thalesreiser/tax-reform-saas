ALTER TYPE "public"."audit_action" ADD VALUE 'member.invitation_resent' BEFORE 'member.invitation_rejected';
--> statement-breakpoint
CREATE TABLE "office_logos" (
	"office_id" uuid PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "office_logos_content_type_check" CHECK ("office_logos"."content_type" in ('image/png', 'image/jpeg', 'image/webp')),
	CONSTRAINT "office_logos_size_check" CHECK (octet_length("office_logos"."data") <= 204800)
);
--> statement-breakpoint
ALTER TABLE "offices" ADD COLUMN "cnpj" char(14);
--> statement-breakpoint
ALTER TABLE "offices" ADD COLUMN "contact_email" text;
--> statement-breakpoint
ALTER TABLE "offices" ADD COLUMN "contact_phone" text;
--> statement-breakpoint
ALTER TABLE "offices" ADD COLUMN "brand_color" text;
--> statement-breakpoint
ALTER TABLE "offices" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "office_logos" ADD CONSTRAINT "office_logos_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "offices" ADD CONSTRAINT "offices_cnpj_check" CHECK ("offices"."cnpj" ~ '^[0-9A-Z]{12}[0-9]{2}$');
--> statement-breakpoint
ALTER TABLE "offices" ADD CONSTRAINT "offices_brand_color_check" CHECK ("offices"."brand_color" ~ '^#[0-9A-F]{6}$');

--> statement-breakpoint
-- Hand-written below (BE-02.1), like 0001_office_rls.sql: the logo belongs to its office's tenant.
ALTER TABLE "office_logos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "office_logos" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "office_isolation" ON "office_logos"
  USING ("office_id" = public.app_current_office_id())
  WITH CHECK ("office_id" = public.app_current_office_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "office_logos" TO trs_app;
--> statement-breakpoint
-- The office profile is edited by the API; id and created_at stay read-only.
GRANT UPDATE ("cnpj", "contact_email", "contact_phone", "brand_color", "updated_at") ON "offices" TO trs_app;
--> statement-breakpoint
-- Like 0006_supabase_hardening.sql: service_role bypasses row-level security, so it gets no grant
-- on the new tenant table (anon and authenticated are covered by the default privileges there).
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON "office_logos" FROM service_role;
  END IF;
END
$$;

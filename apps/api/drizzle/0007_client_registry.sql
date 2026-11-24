ALTER TABLE "clients" ADD COLUMN "trade_name" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "address" jsonb;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "main_cnae" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "secondary_cnaes" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "registration_status" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "tax_regime" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "lookup_source" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "lookup_fetched_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "notes" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_cnpj_check" CHECK ("clients"."cnpj" ~ '^[0-9A-Z]{12}[0-9]{2}$');

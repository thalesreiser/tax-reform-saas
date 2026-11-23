-- Row-level security by office (BE-01.2, RNF-02). Hand-written: drizzle-kit cannot express roles,
-- grants or FORCE ROW LEVEL SECURITY. See the "Database" section of apps/api/README.md.

-- Role of the API. NOLOGIN: each environment creates a login user that is a member of it. It is
-- never superuser, never BYPASSRLS and never owns a table, so the policies always apply to it.
-- Roles are cluster-wide, so an existing one is kept (the integration suite checks its attributes).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'trs_app') THEN
    CREATE ROLE trs_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
-- Office of the current transaction, set only by withOffice() with SET LOCAL semantics. NULL when
-- unset; the empty string a pooled connection keeps after a transaction ends is NULL as well, so
-- every policy compares against NULL and matches nothing.
CREATE FUNCTION public.app_current_office_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(pg_catalog.current_setting('app.office_id', true), '')::uuid $$;
--> statement-breakpoint
ALTER TABLE "offices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "offices" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "office_isolation" ON "offices"
  USING ("id" = public.app_current_office_id())
  WITH CHECK ("id" = public.app_current_office_id());
--> statement-breakpoint
-- An office is created inside withOffice() with its own id; it is never deleted by the API.
GRANT SELECT, INSERT ON "offices" TO trs_app;
--> statement-breakpoint
GRANT UPDATE ("name") ON "offices" TO trs_app;
--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "clients" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "office_isolation" ON "clients"
  USING ("office_id" = public.app_current_office_id())
  WITH CHECK ("office_id" = public.app_current_office_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "clients" TO trs_app;

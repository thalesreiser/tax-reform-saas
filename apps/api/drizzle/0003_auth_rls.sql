-- better-auth tables (BE-01.3): grants to the API role and the office <-> organization bridge.
-- Hand-written, like 0001_office_rls.sql. See the "Auth" section of apps/api/README.md.

-- Every organization has exactly one office with the same id, created and renamed in the same
-- transaction as the organization (the offices FK to auth_organizations makes the reverse hold).
-- Not SECURITY DEFINER: it runs as the API role, so the office_isolation policy still applies; the
-- office of the transaction is set to the new id for the write and then restored.
CREATE FUNCTION public.sync_office_from_organization() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
DECLARE
  previous text := pg_catalog.current_setting('app.office_id', true);
BEGIN
  PERFORM pg_catalog.set_config('app.office_id', NEW.id::text, true);
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.offices (id, name) VALUES (NEW.id, NEW.name);
  ELSE
    UPDATE public.offices SET name = NEW.name WHERE id = NEW.id;
  END IF;
  PERFORM pg_catalog.set_config('app.office_id', coalesce(previous, ''), true);
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER "auth_organizations_sync_office"
  AFTER INSERT OR UPDATE OF "name" ON "auth_organizations"
  FOR EACH ROW EXECUTE FUNCTION public.sync_office_from_organization();
--> statement-breakpoint
-- No row-level security on these tables: they are not tenant data and better-auth filters them by
-- user, session token or organization itself. Grants are the minimum better-auth needs with the
-- features enabled in src/auth/auth.ts (no user deletion, no organization deletion).
GRANT SELECT, INSERT, UPDATE ON "auth_users" TO trs_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth_sessions" TO trs_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "auth_accounts" TO trs_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth_verifications" TO trs_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "auth_organizations" TO trs_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth_members" TO trs_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "auth_invitations" TO trs_app;

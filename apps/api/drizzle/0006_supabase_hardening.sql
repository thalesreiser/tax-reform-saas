-- Supabase hardening (EST-03.2, ADR 008). Hand-written, like 0001_office_rls.sql.
-- Supabase grants every table, sequence and function in "public" to its Data API roles (anon,
-- authenticated, service_role) through default privileges. The API never uses the Data API, so our
-- objects are taken away from those roles; only trs_app (row-level security) and the owner keep
-- access. Where the roles do not exist (CI, local Postgres) this is a no-op.
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);
      -- Objects created later by the migration owner are not granted to them either.
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', api_role);
    END IF;
  END LOOP;
  -- service_role: only the objects that exist now (all ours); its default privileges are left to
  -- Supabase. It bypasses row-level security, so it must not keep grants on tenant tables.
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM service_role;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM service_role;
  END IF;
END
$$;

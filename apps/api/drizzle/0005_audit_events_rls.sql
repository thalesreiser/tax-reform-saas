-- Audit log (BE-02.7, RF-18): row-level security by office and append-only access. Hand-written,
-- like 0001_office_rls.sql. See the "Audit log" section of apps/api/README.md.

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "office_isolation" ON "audit_events"
  USING ("office_id" = public.app_current_office_id())
  WITH CHECK ("office_id" = public.app_current_office_id());
--> statement-breakpoint
-- Append-only: the API writes and reads events, never changes or removes them.
GRANT SELECT, INSERT ON "audit_events" TO trs_app;
--> statement-breakpoint
-- Also for the owner role: an event can only be changed or removed by a migration that drops these
-- triggers first, in review (the retention policy is pending, see README).
CREATE FUNCTION public.reject_audit_event_change() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (% rejected)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;
--> statement-breakpoint
CREATE TRIGGER "audit_events_append_only"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION public.reject_audit_event_change();
--> statement-breakpoint
CREATE TRIGGER "audit_events_no_truncate"
  BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_audit_event_change();

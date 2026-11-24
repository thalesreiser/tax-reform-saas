# Operations runbook

Restore, rollback, secret rotation, outages and the production readiness checklist (EST-03.4,
RNF-02). Set-up of the pieces referred to here is in [README.md](README.md).

## Restore a backup (drill)

`.github/workflows/db-backup.yml` writes one encrypted dump a day to the R2 bucket `trs-backups`
under `staging/YYYY/MM/DD/trs-<timestamp>-<sha>.dump.age`. Only Thales holds the age private key,
so the drill is manual and run by him. Never run it in CI, never attach a dump or a decrypted file
to an issue, PR or chat, and delete every local copy at the end. Expected time: about 30 minutes,
most of it creating the scratch project.

Tools: `aws` CLI v2, `age` 1.3 and the Postgres 17 client (`pg_restore`, `psql`).

1. **Target.** Create a throw-away Supabase project (free plan, `sa-east-1`) named `trs-restore-drill`.
   Copy its session pooler URL (port 5432) into a hidden prompt: `read -rs TARGET_URL`. Never
   restore over staging itself.
2. **Download** the latest object (bucket-scoped R2 token, read access):

   ```sh
   read -rs AWS_ACCESS_KEY_ID; read -rs AWS_SECRET_ACCESS_KEY; export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
   export AWS_DEFAULT_REGION=auto AWS_REQUEST_CHECKSUM_CALCULATION=when_required
   R2=https://<account id>.r2.cloudflarestorage.com
   aws s3 ls s3://trs-backups/staging/ --recursive --endpoint-url "$R2" | tail -3
   aws s3 cp s3://trs-backups/<key> drill.dump.age --endpoint-url "$R2"
   ```

3. **Decrypt** with the private key from the password manager (paste it into a file with mode 600,
   or `age -d -i -` to read it from stdin): `age --decrypt -i key.txt -o drill.dump drill.dump.age`.
4. **Restore.** Policies grant to the `trs_app` role, which is cluster-level and not in the dump:

   ```sh
   psql "$TARGET_URL" -c "CREATE ROLE trs_app NOLOGIN"
   pg_restore --dbname="$TARGET_URL" --no-owner --exit-on-error drill.dump
   ```

5. **Verify** that the data matches. Run the same queries on staging (SQL editor) and on the target;
   the results must be identical (the backup is a snapshot, so compare with counts at backup time or
   accept rows created since then):

   ```sql
   SELECT 'offices', count(*) FROM offices UNION ALL
   SELECT 'clients', count(*) FROM clients UNION ALL
   SELECT 'audit_events', count(*) FROM audit_events UNION ALL
   SELECT 'auth_users', count(*) FROM auth_users UNION ALL
   SELECT 'auth_organizations', count(*) FROM auth_organizations;
   SELECT md5(string_agg(id::text, ',' ORDER BY id)) FROM audit_events;
   SELECT count(*) FROM drizzle.__drizzle_migrations;
   ```

6. **Clean up:** `shred -u drill.dump key.txt; rm drill.dump.age; unset TARGET_URL AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY`, delete the scratch Supabase project, and record the date and result on the
   EST-03.4 card (the readiness checklist asks for a drill in the last 30 days).

To restore staging itself after data loss, follow steps 2 to 4 against staging with
`--clean --if-exists` (the role already exists), then run "Deploy staging" by hand.

## Roll back a deploy

- **API and engines (Fly):** `fly releases --app <app> --image` lists the images; deploy the previous
  one with `fly deploy --config deploy/fly/<file>.toml --app <app> --image
registry.fly.io/<app>:<previous tag or sha>` (add `--env APP_VERSION=<sha>` for the API). Then
  revert the commit on `develop` so the next deploy does not bring it back.
- **Web (Cloudflare Workers):** dashboard, Workers, `trs-web`, Deployments, pick the previous version,
  "Rollback"; or `wrangler rollback --name trs-web` (`wrangler deployments list` shows the ids).
- **Database:** migrations are never rolled back automatically; a bad migration is fixed by a new
  one. If data was damaged, restore the last good backup (above).

## Rotate a secret

1. Create the new value at the provider (Supabase password, Fly token, R2 token, Sentry DSN).
2. Replace it with hidden input: `gh secret set <NAME> --env staging` (prompts) for GitHub,
   `fly secrets import --app trs-tax-api` from a `read -rs` variable for Fly.
3. Redeploy if the app reads it at start ("Deploy staging" by hand), confirm `/health` and revoke the
   old value.

- **age key:** generate a new pair, set the new `BACKUP_AGE_RECIPIENT`, keep the old private key until
  every backup encrypted with it has expired (30 days), then destroy it. If the private key leaked,
  delete the objects encrypted with it from R2.
- **`BETTER_AUTH_SECRET`:** rotating it signs every user out.

## When a provider is down

- **Fly app down:** check `fly status --app <app>`, `fly logs --app <app>` and
  https://status.flyio.net. A crashing machine: roll back (above). `fly machine restart <id>` for a
  stuck one. The uptime issue closes itself on the next good check.
- **Supabase down or paused:** check https://status.supabase.com and the project dashboard. A free
  project pauses after 7 days without activity; the daily backup query keeps it active, so a pause
  means backups stopped (look for the `backup` issue). Restore the project from the dashboard
  ("Restore project"); if it is lost, create a new one, restore the last backup and update
  `DATABASE_MIGRATION_URL` and `DATABASE_URL`.
- **Cloudflare down:** nothing to do but wait (https://www.cloudflarestatus.com); the API stays up.

## Production readiness checklist

Every item is done (or decided by Thales and recorded) before real client data:

- [ ] Supabase Pro with daily backups; decision on point-in-time recovery (paid add-on).
- [ ] The R2 backup keeps running for production, under its own prefix and key pair.
- [ ] A restore drill passed in the last 30 days (date on the card).
- [ ] Fly `min_machines_running = 1` for the API and each engine (ADR 008).
- [ ] Sentry DSNs set for the API and the web (README, Observability).
- [ ] Own domain for web and API; cookies `Secure`, `HttpOnly`, `SameSite` checked on that domain;
      `BETTER_AUTH_URL` updated.
- [ ] Transactional e-mail provider configured (invitations, password reset).
- [ ] Rate-limit store moved from memory to Postgres or Redis (ADR 008).
- [ ] Uptime alerts reach Thales (issue notifications on), plus an external monitor if decided.
- [ ] LGPD: privacy policy and terms published, processors listed (Fly, Supabase, Cloudflare, Sentry),
      retention and deletion of office data defined, a contact for data subject requests, incident
      procedure (who is told, within what time).
- [ ] Secrets rotated from their staging values; nobody but Thales holds production tokens.

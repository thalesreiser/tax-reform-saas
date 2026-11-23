CREATE TYPE "public"."audit_action" AS ENUM('office.created', 'office.updated', 'member.invited', 'member.invitation_canceled', 'member.invitation_rejected', 'member.joined', 'member.role_changed', 'member.removed', 'member.left', 'client.created', 'client.updated', 'client.deleted');
--> statement-breakpoint
CREATE TYPE "public"."audit_resource_type" AS ENUM('office', 'invitation', 'member', 'client');
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"office_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_role" text,
	"action" "audit_action" NOT NULL,
	"resource_type" "audit_resource_type" NOT NULL,
	"resource_id" uuid NOT NULL,
	"occurred_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"request_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "audit_events_metadata_check" CHECK (jsonb_typeof("audit_events"."metadata") = 'object' and octet_length("audit_events"."metadata"::text) <= 1024)
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "audit_events_office_id_occurred_at_idx" ON "audit_events" USING btree ("office_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);
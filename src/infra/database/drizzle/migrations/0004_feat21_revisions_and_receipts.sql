ALTER TABLE "parties" ADD COLUMN "revision" bigint DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "party_action_receipts" ADD COLUMN "route" text DEFAULT 'action' NOT NULL;
--> statement-breakpoint
ALTER TABLE "party_action_receipts" ADD COLUMN "domain_events" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "party_action_receipts" ALTER COLUMN "action" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "party_action_receipts" DROP CONSTRAINT "party_action_receipts_party_id_key_pk";
--> statement-breakpoint
ALTER TABLE "party_action_receipts" ADD CONSTRAINT "party_action_receipts_party_id_route_key_pk" PRIMARY KEY ("party_id","route","key");
--> statement-breakpoint
DROP INDEX "party_action_receipts_pending";
--> statement-breakpoint
CREATE UNIQUE INDEX "party_action_receipts_pending" ON "party_action_receipts" ("party_id") WHERE "response" IS NULL AND "route" = 'action';
--> statement-breakpoint
CREATE INDEX "party_advance_receipts_pending" ON "party_action_receipts" ("party_id") WHERE "response" IS NULL;

CREATE TABLE "party_action_receipts" (
	"party_id" uuid NOT NULL,
	"key" uuid NOT NULL,
	"action" jsonb NOT NULL,
	"combat_updates" jsonb NOT NULL,
	"response" jsonb,
	CONSTRAINT "party_action_receipts_party_id_key_pk" PRIMARY KEY("party_id","key")
);
--> statement-breakpoint
ALTER TABLE "party_action_receipts" ADD CONSTRAINT "party_action_receipts_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "party_action_receipts_pending" ON "party_action_receipts" USING btree ("party_id") WHERE "party_action_receipts"."response" is null;

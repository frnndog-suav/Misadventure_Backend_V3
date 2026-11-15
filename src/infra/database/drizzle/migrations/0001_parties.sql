CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"saved_at" timestamp with time zone NOT NULL
);

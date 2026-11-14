CREATE TABLE "game_config" (
	"id" text PRIMARY KEY NOT NULL,
	"values" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

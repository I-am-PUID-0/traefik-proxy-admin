CREATE TABLE IF NOT EXISTS "service_auth_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"session_token" varchar(255) NOT NULL,
	"return_to" text NOT NULL,
	"user_identifier" varchar(255),
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_auth_tickets_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "service_auth_tickets" ADD CONSTRAINT "service_auth_tickets_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_auth_tickets_token_idx" ON "service_auth_tickets" ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_auth_tickets_expires_at_idx" ON "service_auth_tickets" ("expires_at");

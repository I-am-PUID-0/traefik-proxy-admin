ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "auth_method" varchar(50);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "client_ip" varchar(120);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "client_ip_source" varchar(80);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "last_ip" varchar(120);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "ip_changed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "user_agent" text;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "last_user_agent" text;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "user_agent_changed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "requested_host" varchar(255);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "entry_point" varchar(120);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "last_path" text;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "access_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "risk_flags" text;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "sso_issuer" text;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "sso_subject" varchar(255);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "sso_email" varchar(255);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "sso_name" varchar(255);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "sso_groups" text;

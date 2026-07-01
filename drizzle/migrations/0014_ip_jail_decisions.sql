CREATE TABLE IF NOT EXISTS "ip_jail_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "subject" varchar(255) NOT NULL,
  "reason" text,
  "source" varchar(80) DEFAULT 'manual' NOT NULL,
  "evidence" text,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ip_jail_decisions_subject_idx" ON "ip_jail_decisions" ("subject");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ip_jail_decisions_active_idx" ON "ip_jail_decisions" ("is_enabled", "expires_at");

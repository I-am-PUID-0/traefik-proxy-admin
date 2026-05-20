ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "pass_host_header" boolean DEFAULT true NOT NULL;
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "managed_middlewares" text;
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "advanced_routers" text;

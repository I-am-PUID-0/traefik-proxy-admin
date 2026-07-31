ALTER TABLE "sso_configs"
  ADD COLUMN IF NOT EXISTS "token_endpoint_auth_method" varchar(32)
  DEFAULT 'client_secret_post' NOT NULL;

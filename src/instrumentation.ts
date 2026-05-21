import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { dbCredentials, migrationsFolder } from "../drizzle.config";
import postgres from "postgres";

const LATEST_MIGRATION_CREATED_AT = 1779386400000;

function getBuildId() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    return fs.readFileSync("./.next/BUILD_ID", "utf8").trim();
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ENOENT"
    ) {
      return "development";
    }
    return "development";
  }
}


async function getDefaultDomainConfig(
  migrationClient: postgres.Sql,
): Promise<{ domain: string; certResolver: string }> {
  const [config] = await migrationClient<{ value: string }[]>`
    select value
    from app_config
    where key = 'traefik_global_config'
    limit 1
  `;

  if (!config?.value) {
    return { domain: "example.com", certResolver: "letsencrypt" };
  }

  try {
    const parsed = JSON.parse(config.value) as {
      sampleDomain?: unknown;
      certResolver?: unknown;
    };

    return {
      domain:
        typeof parsed.sampleDomain === "string" && parsed.sampleDomain.trim()
          ? parsed.sampleDomain.trim()
          : "example.com",
      certResolver:
        typeof parsed.certResolver === "string" && parsed.certResolver.trim()
          ? parsed.certResolver.trim()
          : "letsencrypt",
    };
  } catch {
    return { domain: "example.com", certResolver: "letsencrypt" };
  }
}

async function repairLegacySchema(migrationClient: postgres.Sql) {
  console.log("Repairing legacy database schema before stamping migrations.");

  await migrationClient`
    create table if not exists domains (
      id uuid primary key default gen_random_uuid() not null,
      name varchar(255) not null,
      domain varchar(255) not null,
      description text,
      use_wildcard_cert boolean default true not null,
      cert_resolver varchar(255) default 'letsencrypt' not null,
      certificate_configs text,
      is_default boolean default false not null,
      created_at timestamp default now() not null,
      updated_at timestamp default now() not null
    )
  `;
  await migrationClient`
    create table if not exists basic_auth_configs (
      id uuid primary key default gen_random_uuid() not null,
      name varchar(255) not null,
      description text,
      created_at timestamp default now() not null,
      updated_at timestamp default now() not null
    )
  `;
  await migrationClient`
    create table if not exists basic_auth_users (
      id uuid primary key default gen_random_uuid() not null,
      config_id uuid not null,
      username varchar(255) not null,
      password_hash varchar(255) not null,
      created_at timestamp default now() not null,
      updated_at timestamp default now() not null
    )
  `;
  await migrationClient`
    create table if not exists sso_configs (
      id uuid primary key default gen_random_uuid() not null,
      name varchar(255) not null,
      description text,
      enabled boolean default true not null,
      idp_url text,
      authorization_url text,
      token_url text,
      userinfo_url text,
      client_id varchar(255) not null,
      client_secret text not null,
      redirect_uri text not null,
      scopes text not null,
      created_at timestamp default now() not null,
      updated_at timestamp default now() not null
    )
  `;
  await migrationClient`
    create table if not exists service_security_configs (
      id uuid primary key default gen_random_uuid() not null,
      service_id uuid not null,
      security_type varchar(50) not null,
      is_enabled boolean default true not null,
      priority integer default 0 not null,
      config text not null,
      created_at timestamp default now() not null,
      updated_at timestamp default now() not null
    )
  `;

  await migrationClient`
    alter table services
      add column if not exists enabled_at timestamp default now(),
      add column if not exists enable_duration_minutes integer,
      add column if not exists request_headers text,
      add column if not exists insecure_skip_verify boolean default false not null,
      add column if not exists pass_host_header boolean default true not null,
      add column if not exists domain_id uuid,
      add column if not exists hostname_mode varchar(20) default 'subdomain' not null,
      add column if not exists custom_hostnames text,
      add column if not exists entrypoint varchar(255),
      add column if not exists managed_middlewares text,
      add column if not exists advanced_routers text
  `;
  await migrationClient`alter table services alter column subdomain drop not null`;
  await migrationClient`alter table domains add column if not exists certificate_configs text`;

  const { domain, certResolver } = await getDefaultDomainConfig(migrationClient);
  await migrationClient`
    insert into domains (
      name,
      domain,
      description,
      use_wildcard_cert,
      cert_resolver,
      is_default
    )
    select
      'Default',
      ${domain},
      'Created during legacy schema repair',
      true,
      ${certResolver},
      true
    where not exists (select 1 from domains)
  `;
  await migrationClient`
    update domains
    set is_default = true
    where id = (
      select id
      from domains
      order by is_default desc, created_at asc
      limit 1
    )
    and not exists (select 1 from domains where is_default = true)
  `;
  await migrationClient`
    update services
    set domain_id = (
      select id
      from domains
      order by is_default desc, created_at asc
      limit 1
    )
    where domain_id is null
  `;
  await migrationClient`alter table services alter column domain_id set not null`;

  await migrationClient`
    alter table services
      drop constraint if exists services_subdomain_unique,
      drop constraint if exists services_basic_auth_config_id_basic_auth_configs_id_fk,
      drop column if exists auth_method,
      drop column if exists sso_groups,
      drop column if exists sso_users,
      drop column if exists basic_auth_config_id
  `;

  await migrationClient`
    do $$
    begin
      if not exists (
        select 1 from pg_constraint where conname = 'domains_domain_unique'
      ) then
        alter table domains add constraint domains_domain_unique unique(domain);
      end if;

      if not exists (
        select 1 from pg_constraint where conname = 'basic_auth_configs_name_unique'
      ) then
        alter table basic_auth_configs add constraint basic_auth_configs_name_unique unique(name);
      end if;

      if not exists (
        select 1 from pg_constraint where conname = 'basic_auth_users_config_id_basic_auth_configs_id_fk'
      ) then
        alter table basic_auth_users
          add constraint basic_auth_users_config_id_basic_auth_configs_id_fk
          foreign key (config_id)
          references basic_auth_configs(id)
          on delete cascade;
      end if;

      if not exists (
        select 1 from pg_constraint where conname = 'sso_configs_name_unique'
      ) then
        alter table sso_configs add constraint sso_configs_name_unique unique(name);
      end if;

      if not exists (
        select 1 from pg_constraint where conname = 'service_security_configs_service_id_services_id_fk'
      ) then
        alter table service_security_configs
          add constraint service_security_configs_service_id_services_id_fk
          foreign key (service_id)
          references services(id)
          on delete cascade;
      end if;

      if not exists (
        select 1 from pg_constraint where conname = 'services_domain_id_domains_id_fk'
      ) then
        alter table services
          add constraint services_domain_id_domains_id_fk
          foreign key (domain_id)
          references domains(id)
          on delete restrict;
      end if;
    end
    $$;
  `;

  await migrationClient`create schema if not exists drizzle`;
  await migrationClient`
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `;
  await migrationClient`
    insert into drizzle.__drizzle_migrations (hash, created_at)
    select 'legacy-schema-repair-0010', ${LATEST_MIGRATION_CREATED_AT}
    where not exists (select 1 from drizzle.__drizzle_migrations)
  `;
}

async function runMigrations() {
  console.log("Running database migrations");
  try {
    const migrationClient = postgres(dbCredentials.url, { max: 1 });
    const [{ hasMigrationTable, migrationCount, hasSchema }] = await migrationClient<{
      hasMigrationTable: boolean;
      migrationCount: number;
      hasSchema: boolean;
    }[]>`
      select
        exists (
          select 1
          from information_schema.tables
          where table_schema = 'drizzle'
            and table_name = '__drizzle_migrations'
        ) as "hasMigrationTable",
        case
          when exists (
            select 1
            from information_schema.tables
            where table_schema = 'drizzle'
              and table_name = '__drizzle_migrations'
          ) then (select count(*)::int from drizzle.__drizzle_migrations)
          else 0
        end as "migrationCount",
        exists (
          select 1
          from information_schema.tables
          where table_schema = 'public'
            and table_name = 'app_config'
        ) as "hasSchema"
    `;

    if (hasSchema && (!hasMigrationTable || migrationCount === 0)) {
      await repairLegacySchema(migrationClient);
      await migrationClient.end();
      return;
    }

    const db = drizzle(dbCredentials.url);
    await migrate(db, { migrationsFolder: migrationsFolder });
    await migrationClient.end();
  } catch (error) {
    console.log(`Running migrations failed, please do it manually - ${error}`);
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  process.env["BUILD_ID"] = getBuildId();
  await runMigrations();
}

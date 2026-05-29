# Deployment

This guide covers production use of Traefik Proxy Admin. Development-specific setup lives in [Development](development.md).

## Runtime Model

The production image contains only the Next.js application. It expects external services for:

- PostgreSQL database storage
- Traefik reverse proxy and dynamic config consumer
- Optional Traefik API access for live discovery and diagnostics

## Required Environment

```env
DATABASE_URL=postgresql://user:password@postgres:5432/traefik_proxy_admin
ADMIN_AUTH_ENABLED=true
ADMIN_AUTH_SECRET=<long-random-secret>
ADMIN_AUTH_PROVIDER=local
```

Generate `ADMIN_AUTH_SECRET` with a cryptographically random value:

```bash
openssl rand -base64 48
# or
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Keep this value stable across restarts. Changing it invalidates existing admin sessions.

## Common Optional Environment

```env
TRAEFIK_API_URL=http://traefik:8080
TRAEFIK_ACCESS_LOG_PATH=/logs/traefik/access.log
TARGET_TEST_ALLOW_CIDRS=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
ADMIN_COOKIE_DOMAIN=.example.com
```

`TRAEFIK_API_URL` enables live discovery and diagnostics. It is not required for Traefik to poll generated config from `/api/traefik/config`.

`TRAEFIK_ACCESS_LOG_PATH` enables the read-only log viewer on the Traefik Live page. Mount the Traefik access log file into the TPA container at that path, preferably read-only. TPA supports Traefik JSON access logs and the default extended Common Log Format, so existing non-JSON log consumers can keep using the same file.

`TARGET_TEST_ALLOW_CIDRS` enables TCP target probes. Keep it limited to private Docker, VPN, or LAN ranges.

Use `ADMIN_COOKIE_DOMAIN` only when the admin UI itself must share login sessions across sibling TPA hostnames. Service SSO does not need a global `AUTH_COOKIE_DOMAIN` for multi-domain deployments.

## First Start

1. Start PostgreSQL.
2. Start Traefik Proxy Admin with the required environment.
3. Open the admin UI.
4. Create the first local admin account.
5. Configure domains, certificate resolver names if Traefik should issue certificates, and global defaults. Leave the resolver blank when another layer handles public TLS.
6. Add Traefik's HTTP provider endpoint for `/api/traefik/config`.
7. Add services and verify generated config from the Traefik Live page.

## Switching To SSO Admin Login

Use `ADMIN_AUTH_PROVIDER=local` until local admin access is verified. Then configure the global SSO provider from **Security -> Admin Authentication** and test it before switching `ADMIN_AUTH_PROVIDER=sso`.

Keep **Allow local account sign-in** enabled during rollout so you have a recovery path. See [Authentication](authentication.md#lockout-recovery).

## Traefik Dynamic Config

Configure Traefik to poll:

```text
http://traefik-proxy-admin:3000/api/traefik/config
```

That endpoint is intentionally unauthenticated for Traefik. Restrict access with network placement or reverse-proxy rules. See [Traefik Integration](traefik.md).

## Backups & Restores

Use **Config -> Backup & Restore** to download a full TPA backup before upgrades or risky configuration changes. The backup includes global app config, domains, services, service security rules, reusable Basic Auth and SSO provider configs, shared links, local admin auth config, password hashes, and OAuth client secrets. Store backup files like credentials.

Restore currently uses replace mode: TPA validates the selected backup, shows a dry-run summary, and then deletes existing domains, services, service security rules, reusable auth providers, shared links, and app config before importing the backup. Active sessions and one-time service auth tickets are intentionally excluded, so users must sign in again after a restore.

PostgreSQL backups are still recommended for disaster recovery, especially before changing image versions or running migrations. The TPA JSON backup is intended for portable app-level recovery and migration between instances.

## Upgrades

Before upgrading:

- Back up PostgreSQL.
- Review the release notes in `CHANGELOG.md`.
- Keep the same `ADMIN_AUTH_SECRET` unless you intentionally want to invalidate sessions.
- Confirm the new image tag supports your platform architecture.

The application runs database migration/repair logic at startup. Existing production data should still be backed up before major upgrades.

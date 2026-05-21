# Traefik Proxy Admin

Traefik Proxy Admin is a web UI for managing Traefik dynamic HTTP configuration from a PostgreSQL-backed Next.js app. It can create and preview routers, services, middlewares, service auth rules, shared links, and live Traefik diagnostics.

The project is intended for privately operated reverse-proxy environments where Traefik exposes internal services through controlled routes, authentication, and temporary access links.

## Features

- Service CRUD for Traefik HTTP routers and load-balancer services
- Domain, certificate resolver, entrypoint, middleware, and request-header management
- Advanced router and managed middleware JSON for bypass rules and redirects
- Service import/export using a portable JSON format
- Admin authentication with local accounts or OIDC/SSO
- Service authentication through shared links, Basic Auth, and SSO forwardAuth
- Live Traefik discovery for entrypoints, routers, services, middlewares, drift, and target checks
- Devcontainer with Node.js, PostgreSQL, and local Traefik for development

## Screenshots

![Service list](docs/screenshots/screenshot1.png "Service list")
![Session management](docs/screenshots/screenshot4.png "Session management")
![Global configuration](docs/screenshots/screenshot2.png "Global configuration")
![Service configuration](docs/screenshots/screenshot3.png "Service configuration")

## Architecture

```text
Admin UI/API (Next.js) -> PostgreSQL
Admin UI/API (Next.js) -> generated Traefik config endpoint
Traefik -> target services
```

Traefik polls `GET /api/traefik/config` for generated dynamic configuration. Optional live discovery uses `TRAEFIK_API_URL` to inspect Traefik's API for selectors, diagnostics, and drift detection.

## Quick Start

```bash
git clone <repository-url>
cd traefik-proxy-admin
cp .env.example .env
pnpm install
pnpm dev
```

At minimum, configure `DATABASE_URL` in `.env`. Open `http://localhost:3000` and create the first local admin account when prompted.

For the full development workflow, use the included devcontainer and see [Development](docs/development.md).

## Production Image

The published Docker image contains only the Traefik Proxy Admin Next.js app. It does not bundle PostgreSQL or Traefik.

Required environment:

```env
DATABASE_URL=postgresql://user:password@postgres:5432/traefik_share
ADMIN_AUTH_ENABLED=true
ADMIN_AUTH_SECRET=<long-random-secret>
ADMIN_AUTH_PROVIDER=local
```

Generate `ADMIN_AUTH_SECRET` with a cryptographically random value, for example:

```bash
openssl rand -base64 48
# or
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Common optional environment:

```env
TRAEFIK_API_URL=http://traefik:8080
TARGET_TEST_ALLOW_CIDRS=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
ADMIN_COOKIE_DOMAIN=.example.com
AUTH_COOKIE_DOMAIN=.example.com
```

Read [Security Hardening](docs/security-hardening.md) before exposing a production deployment.

## Documentation

- [Authentication](docs/authentication.md): admin auth, local users, SSO/OIDC, service auth, public auth endpoints, and lockout recovery.
- [Service Configuration](docs/services.md): services, domains, middlewares, advanced routers, managed middlewares, and import/export.
- [Traefik Integration](docs/traefik.md): HTTP provider setup, live discovery, config endpoint exposure, and target probes.
- [Security Hardening](docs/security-hardening.md): production checklist, cookie domains, Traefik API access, target probes, and secrets.
- [Development](docs/development.md): devcontainer usage, reverse-proxied Next dev origins, local Traefik files, and verification.

New features should update the relevant document above instead of growing this README with operational detail.

## Verification

Before pushing a commit, run the full verification suite from inside the devcontainer:

```bash
pnpm verify
```

Useful shorter checks during active development:

```bash
pnpm lint
pnpm test
pnpm build
```

## Fork Notice

This is a community-maintained fork of https://github.com/Janhouse/traefik-proxy-admin.

## License

Copyright (c) 2025 The Traefik Proxy Admin Contributors

This project is licensed under AGPL-3.0-or-later. See LICENSE and NOTICE.

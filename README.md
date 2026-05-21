# Traefik Proxy Admin

Traefik Proxy Admin is a production-focused web UI for managing Traefik dynamic HTTP configuration. It runs as a standalone Next.js container backed by PostgreSQL and generates Traefik routers, services, middlewares, service authentication, shared links, and live diagnostics.

Use it when you want a managed UI/API for exposing private HTTP services through Traefik without manually maintaining every dynamic config file.

## Core Capabilities

- Create, edit, disable, import, and export proxied services
- Generate Traefik routers, services, TLS settings, middlewares, and advanced router rules
- Protect the admin UI/API with local accounts or OIDC/SSO
- Protect proxied services with shared links, Basic Auth, or SSO forwardAuth
- Discover live Traefik entrypoints, routers, services, and middlewares when the Traefik API is configured
- Inspect generated-config drift and service target health from the Traefik Live page

## Screenshots

![Service list](docs/screenshots/screenshot1.png "Service list")
![Session management](docs/screenshots/screenshot4.png "Session management")
![Global configuration](docs/screenshots/screenshot2.png "Global configuration")
![Service configuration](docs/screenshots/screenshot3.png "Service configuration")

## Production Deployment

The published image contains only the Traefik Proxy Admin application. Run PostgreSQL and Traefik as separate services.

Example compose service:

```yaml
services:
  traefik-proxy-admin:
    image: iampuid0/traefik-proxy-admin:latest
    environment:
      DATABASE_URL: postgresql://tpa:change-me@postgres:5432/traefik_proxy_admin
      ADMIN_AUTH_ENABLED: "true"
      ADMIN_AUTH_SECRET: ${ADMIN_AUTH_SECRET}
      ADMIN_AUTH_PROVIDER: local
      TRAEFIK_API_URL: http://traefik:8080
    ports:
      - "3000:3000"
    depends_on:
      - postgres

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: traefik_proxy_admin
      POSTGRES_USER: tpa
      POSTGRES_PASSWORD: change-me
    volumes:
      - tpa-postgres:/var/lib/postgresql/data

volumes:
  tpa-postgres:
```

Generate `ADMIN_AUTH_SECRET` before first start:

```bash
openssl rand -base64 48
```

Then open the app and create the first local admin account. Review [Deployment](docs/deployment.md), [Authentication](docs/authentication.md), and [Security Hardening](docs/security-hardening.md) before exposing the admin UI beyond a trusted network.

## Traefik Provider Setup

Configure Traefik to poll the generated config endpoint:

```yaml
providers:
  http:
    endpoints:
      - "http://traefik-proxy-admin:3000/api/traefik/config"
    pollInterval: "10s"
```

Keep `/api/traefik/config` reachable only by Traefik or an internal network path. See [Traefik Integration](docs/traefik.md) for forwardAuth, live discovery, and target probe guidance.

## Documentation

Production and operator docs:

- [Deployment](docs/deployment.md): production container setup, required environment, startup flow, and upgrade notes.
- [Authentication](docs/authentication.md): admin auth, local users, SSO/OIDC, service auth, public auth endpoints, and lockout recovery.
- [Service Configuration](docs/services.md): services, domains, middlewares, advanced routers, managed middlewares, and import/export.
- [Traefik Integration](docs/traefik.md): HTTP provider setup, live discovery, config endpoint exposure, and target probes.
- [Security Hardening](docs/security-hardening.md): production checklist, cookie domains, Traefik API access, target probes, and secrets.

Contributor docs:

- [Contributing](CONTRIBUTING.md): branch model, pull requests, conventional commits, and checks.
- [Development](docs/development.md): devcontainer usage, local Traefik files, reverse-proxied Next dev origins, and verification.
- [Security Policy](SECURITY.md): supported branches and private vulnerability reporting.

New features should update the relevant document instead of growing this README with operational detail.

## Fork Notice

This is a community-maintained fork of https://github.com/Janhouse/traefik-proxy-admin.

## License

Copyright (c) 2025 The Traefik Proxy Admin Contributors

This project is licensed under AGPL-3.0-or-later. See LICENSE and NOTICE.

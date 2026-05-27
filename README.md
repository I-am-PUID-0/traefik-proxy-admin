<div align="center">
  <table>
    <tr>
      <td align="center" width="96">
        <a href="https://github.com/I-am-PUID-0/traefik-proxy-admin">
          <img src="public/tpa-icon.svg" alt="Traefik Proxy Admin logo" width="84" height="84">
        </a>
      </td>
      <td align="left">
        <h1>Traefik Proxy Admin</h1>
        <p><strong>Manage Traefik HTTP provider services, authentication, sessions, and live proxy diagnostics from one focused UI.</strong></p>
      </td>
    </tr>
  </table>
</div>

<div align="center">
  <a href="https://github.com/I-am-PUID-0/traefik-proxy-admin/stargazers">
    <img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/I-am-PUID-0/traefik-proxy-admin?style=for-the-badge">
  </a>
  <a href="https://github.com/I-am-PUID-0/traefik-proxy-admin/issues">
    <img alt="Issues" src="https://img.shields.io/github/issues/I-am-PUID-0/traefik-proxy-admin?style=for-the-badge">
  </a>
  <a href="https://github.com/I-am-PUID-0/traefik-proxy-admin/graphs/contributors">
    <img alt="Contributors" src="https://img.shields.io/github/contributors/I-am-PUID-0/traefik-proxy-admin?style=for-the-badge">
  </a>
  <a href="https://hub.docker.com/r/iampuid0/traefik-proxy-admin">
    <img alt="Docker Pulls" src="https://img.shields.io/docker/pulls/iampuid0/traefik-proxy-admin?style=for-the-badge&logo=docker&logoColor=white">
  </a>
  <a href="https://github.com/I-am-PUID-0/traefik-proxy-admin/actions/workflows/docker-image.yml">
    <img alt="Build Status" src="https://img.shields.io/github/actions/workflow/status/I-am-PUID-0/traefik-proxy-admin/docker-image.yml?style=for-the-badge">
  </a>
</div>

Traefik Proxy Admin is a production-focused web UI for managing Traefik dynamic HTTP configuration. It runs as a standalone Next.js container backed by PostgreSQL and generates Traefik routers, services, middlewares, service authentication, shared links, and live diagnostics.

Use it when you want a managed UI/API for exposing private HTTP services through Traefik without manually maintaining every dynamic config file.

## Core Capabilities

- Create, edit, disable, import, and export proxied services
- Generate Traefik routers, services, TLS settings, middlewares, and advanced router rules
- Protect the admin UI/API with local accounts or OIDC/SSO
- Protect proxied services with shared links, Basic Auth, or SSO forwardAuth
- Add service-level Bypass Rules for webhooks, companion apps, health checks, and automations, with optional observed bypass session tracking
- Discover live Traefik entrypoints, routers, services, and middlewares when the Traefik API is configured
- Inspect generated-config drift, service target health, and optional Traefik access logs from the Traefik Live page

## Screenshots

<table>
  <tr>
    <td width="50%" align="center"><strong>Login</strong><br><a href="docs/screenshots/login.png"><img src="docs/screenshots/login.png" alt="Login" width="100%"></a></td>
    <td width="50%" align="center"><strong>Add Service</strong><br><a href="docs/screenshots/add_service.png"><img src="docs/screenshots/add_service.png" alt="Add Service" width="100%"></a></td>
  </tr>
  <tr>
    <td width="50%" align="center"><strong>Discovered Entrypoints</strong><br><a href="docs/screenshots/discovered_entrypoints.png"><img src="docs/screenshots/discovered_entrypoints.png" alt="Discovered Entrypoints" width="100%"></a></td>
    <td width="50%" align="center"><strong>Dynamic Add Middleware</strong><br><a href="docs/screenshots/dynamic_add_middleware.png"><img src="docs/screenshots/dynamic_add_middleware.png" alt="Dynamic Add Middleware" width="100%"></a></td>
  </tr>
  <tr>
    <td width="50%" align="center"><strong>Service List</strong><br><a href="docs/screenshots/screenshot1.png"><img src="docs/screenshots/screenshot1.png" alt="Service List" width="100%"></a></td>
    <td width="50%" align="center"><strong>Session Management</strong><br><a href="docs/screenshots/screenshot4.png"><img src="docs/screenshots/screenshot4.png" alt="Session Management" width="100%"></a></td>
  </tr>
  <tr>
    <td width="50%" align="center"><strong>Global Configuration</strong><br><a href="docs/screenshots/screenshot2.png"><img src="docs/screenshots/screenshot2.png" alt="Global Configuration" width="100%"></a></td>
    <td width="50%" align="center"><strong>Service Configuration</strong><br><a href="docs/screenshots/screenshot3.png"><img src="docs/screenshots/screenshot3.png" alt="Service Configuration" width="100%"></a></td>
  </tr>
</table>

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
      TRAEFIK_ACCESS_LOG_PATH: /logs/traefik/access.log
    ports:
      - "3000:3000"
    volumes:
      - /var/log/traefik/access.log:/logs/traefik/access.log:ro
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

Keep `/api/traefik/config` reachable only by Traefik or an internal network path. See [Traefik Integration](docs/traefik.md) for forwardAuth, live discovery, target probe, and access-log viewer guidance.

## Fork Delta

This fork has diverged substantially from upstream after [commit bc1bf6](https://github.com/Janhouse/traefik-proxy-admin/commit/bc1bf6283242149c08eba8d770fdbdc12af5bff4).

The main differences are:

- Modernized the app into a Next.js App Router codebase under `src/`, with TypeScript 6, React 19, Next 16, pnpm, Vitest, Playwright, and a devcontainer workflow.
- Added production packaging and release automation: Docker Hub publishing, multi-arch builds, Release Please, Dependabot, CI, CodeQL-oriented permissions, and pre-push verification docs.
- Added secure-by-default admin authentication with local admin users, optional admin SSO/OIDC, role-aware admin sessions, CSRF/same-origin checks, rate/body guards, and recovery-oriented auth docs.
- Expanded service protection beyond the original shared-link flow with reusable Basic Auth configs, reusable service SSO providers, signed SSO state, multi-domain service SSO tickets, session risk metadata, and service-level Bypass Rules with Simple or Observed modes.
- Added Traefik operator tooling: live API status, entrypoint/router/service/middleware discovery, middleware validation, target reachability checks with SSRF guards, generated-config preview/diff, drift checks, router import preview, and an optional access-log viewer.
- Added portable service import/export plus full backup/restore for domains, services, security configs, auth providers, app config, shared links, secrets, and admin auth config.
- Added bundled operator documentation inside the app, contextual help bubbles, screenshots, and expanded production/development/security documentation.
- Added legacy database repair and migration safety for pre-Drizzle installs, plus tests covering middleware utilities, access-log parsing, Traefik middleware routes, homepage behavior, and functional API flows.

## Documentation

Production and operator docs:

- [Deployment](docs/deployment.md): production container setup, required environment, startup flow, backups, restores, and upgrade notes. The same operator docs are also available inside the app from the Docs navigation item.
- [Authentication](docs/authentication.md): admin auth, local users, SSO/OIDC, service auth, bypass observation, public auth endpoints, and lockout recovery.
- [Service Configuration](docs/services.md): services, domains, middlewares, Bypass Rules, advanced routers, managed middlewares, and import/export.
- [Traefik Integration](docs/traefik.md): HTTP provider setup, live discovery, config endpoint exposure, target probes, and access log viewing.
- [Security Hardening](docs/security-hardening.md): production checklist, cookie domains, Traefik API access, target probes, and secrets.
- [Comparison: Middleware Manager](docs/comparison-middleware-manager.md): how TPA compares with [hhftechnology/middleware-manager](https://github.com/hhftechnology/middleware-manager), including fit, overlap, and ownership boundaries.

Contributor docs:

- [Contributing](CONTRIBUTING.md): branch model, pull requests, conventional commits, and checks.
- [Development](docs/development.md): devcontainer usage, local Traefik files, reverse-proxied Next dev origins, and verification.
- [Security Policy](SECURITY.md): supported branches and private vulnerability reporting.

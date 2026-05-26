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
- Discover live Traefik entrypoints, routers, services, and middlewares when the Traefik API is configured
- Inspect generated-config drift and service target health from the Traefik Live page

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

- [Deployment](docs/deployment.md): production container setup, required environment, startup flow, backups, restores, and upgrade notes. The same operator docs are also available inside the app from the Docs navigation item.
- [Authentication](docs/authentication.md): admin auth, local users, SSO/OIDC, service auth, public auth endpoints, and lockout recovery.
- [Service Configuration](docs/services.md): services, domains, middlewares, advanced routers, managed middlewares, and import/export.
- [Traefik Integration](docs/traefik.md): HTTP provider setup, live discovery, config endpoint exposure, and target probes.
- [Security Hardening](docs/security-hardening.md): production checklist, cookie domains, Traefik API access, target probes, and secrets.

Contributor docs:

- [Contributing](CONTRIBUTING.md): branch model, pull requests, conventional commits, and checks.
- [Development](docs/development.md): devcontainer usage, local Traefik files, reverse-proxied Next dev origins, and verification.
- [Security Policy](SECURITY.md): supported branches and private vulnerability reporting.

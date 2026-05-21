# Traefik Dynamic Proxy Admin Panel

Admin panel for managing Traefik dynamic configurations with authentication support, including shared links and SSO integration.

Can be used standalone but built in mind with Headscale and other VPN to expose internally hosted servcices to the outside world. Enabling functionality in some ways **similar to Tailscale Funnel but for Headscale**. Inspired by the approach of Pangolin.

## Features

- **Dynamic Traefik Configuration**: Automatically generates Traefik configurations from database
- **Service Management**: Full CRUD operations for proxy services
- **Multiple Authentication Methods**:
  - No authentication
  - Shared links with expiry
  - SSO integration with group/user authorization
- **Session Management**: Memory-cached sessions with admin oversight
- **Real-time Updates**: Live configuration updates for Traefik
- **Modern UI**: Built with Next.js 15, TypeScript, and shadcn/ui

## Screenshots

![screenshot1](docs/screenshots/screenshot1.png "Service list")
![screenshot3](docs/screenshots/screenshot4.png "Session management")
![screenshot2](docs/screenshots/screenshot2.png "Global configuration")
![screenshot3](docs/screenshots/screenshot3.png "Service configuration")

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Admin Panel   │────▶│   PostgreSQL    │     │     Traefik     │
│   (Next.js)     │     │   Database      │     │    Reverse      │
└─────────────────┘     └─────────────────┘     │     Proxy       │
                                                 └─────────────────┘
                                                          │
                              ┌───────────────────────────┘
                              ▼
                        ┌─────────────────┐
                        │  Target Services │
                        │ (HTTP/HTTPS)     │
                        └─────────────────┘
```

## Quick Start

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd traefik-proxy-admin
pnpm install
```

### 2. Set up PostgreSQL

```bash
# Start PostgreSQL with Docker Compose
docker-compose up -d

# Generate and run database migrations
pnpm db:generate
pnpm db:push
```

### 3. Environment Configuration

```bash
cp .env.example .env
# Edit .env with your configuration
```

At minimum, the app needs `DATABASE_URL` so it can connect to PostgreSQL. `TRAEFIK_API_URL` is optional and is only used to discover existing Traefik middlewares for the service form dropdown.

### 4. Start the Development Server

```bash
pnpm dev
```

The admin panel will be available at `http://localhost:3000`

## Production Docker Image

The published Docker image contains the built Next.js app only. It does not bundle PostgreSQL or Traefik; those should run as separate services.

Required environment:

```env
DATABASE_URL=postgresql://user:password@postgres:5432/traefik_share
```

Optional environment:

```env
TRAEFIK_API_URL=http://traefik:8080
TARGET_TEST_ALLOW_CIDRS=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
ADMIN_AUTH_ENABLED=true
ADMIN_AUTH_SECRET=change-me-to-a-long-random-secret
ADMIN_AUTH_PROVIDER=local
ADMIN_COOKIE_DOMAIN=.example.com
AUTH_COOKIE_DOMAIN=.example.com
```

`TRAEFIK_API_URL` is used by Traefik discovery endpoints (`/api/traefik/status`, `/api/traefik/entrypoints`, `/api/traefik/middlewares`, `/api/traefik/routers`, and `/api/traefik/services`) to populate selectors, validate entered middleware names, show live API health, inspect live resources, and detect drift from generated config. It is not required for `/api/traefik/config`; Traefik can still poll the app-generated dynamic config without it. In production, if `TRAEFIK_API_URL` is unset, middleware discovery is disabled and manual middleware values remain editable. In development, the app falls back to `http://localhost:8080` for the devcontainer Traefik instance.

For production, point `TRAEFIK_API_URL` at an internal Docker network hostname, VPN-only address, or another protected Traefik API endpoint. Do not expose Traefik's API/dashboard publicly without authentication.

`TARGET_TEST_ALLOW_CIDRS` controls TCP reachability tests used by the service form Test button, service health endpoint, and Traefik Live target health checks. In production these checks are disabled unless this allowlist is set. Use only the private Docker, VPN, or LAN ranges that Traefik Proxy Admin should be allowed to probe. Development defaults to loopback and private ranges for devcontainer convenience.

### Admin Authentication

Full auth details are in [Authentication](docs/authentication.md).

Traefik Proxy Admin is protected by admin authentication by default. Set `ADMIN_AUTH_SECRET` to a long random value before running the production image. The admin provider is selectable: use `ADMIN_AUTH_PROVIDER=local` for a DUMB-style first-user setup/login flow, or `ADMIN_AUTH_PROVIDER=sso` to require the configured OIDC provider. Set `ADMIN_AUTH_ENABLED=false` only for trusted local development or CI.

Admin access uses signed `tpa-admin-session` cookies and role-based authorization:

- `viewer`: read-only UI and API access.
- `editor`: viewer access plus mutating service operations.
- `admin`: editor access plus security, session, and global configuration operations.

Admin auth settings are stored in app config under `admin_auth_config` and can be managed from Security -> Admin Authentication or with `GET/PUT /api/auth/admin/config`. Local auth stores bcrypt-hashed users with per-user roles and supports first-admin setup from `/auth/login`. SSO auth can match users by OIDC subject, name, or email, and groups from the provider `groups` claim. When SSO is selected, enable local account sign-in from Security -> Admin Authentication to keep local admin login available as a break-glass path. If no SSO role mappings are configured, any successfully authenticated SSO user receives `admin` so first setup is possible. Add group/user role rules immediately after setup for least privilege. For `ADMIN_AUTH_PROVIDER=sso`, configure the global admin SSO provider from Security -> Admin Authentication with `redirectUri` set to `https://<tpa-host>/api/auth/sso/callback`. Stored SSO client secrets are redacted by default but can be deliberately revealed from the editor when an admin needs to inspect or rotate them. SSO editors also provide **Check configuration** and **Test login** actions so endpoint reachability and returned identity claims can be validated before saving or enabling a provider.

Service Basic Auth configurations on the Security page are reusable HTTP Basic Authentication credential sets for proxied services; they are not TPA admin users. Attach them from a service Security page when Traefik should challenge visitors before forwarding to that service.

Service-level SSO works as a built-in Traefik forwardAuth flow. The Security page supports reusable Service SSO provider configs, and each service SSO rule can choose a provider plus its own allowed users/groups. Existing service SSO rules without a provider continue to fall back to the global admin SSO provider stored in `sso_config`. A service with SSO security redirects unauthenticated browser requests through `/api/auth/sso/login`, validates configured service users/groups on callback, then sets the `traefik-session` cookie. Set `AUTH_COOKIE_DOMAIN=.example.com` when the admin app and protected services are on sibling subdomains so the service request can send the shared session cookie.

`/api/traefik/config` remains unauthenticated so Traefik can poll dynamic config. Keep it reachable only from Traefik or an internal network path.

## Dev Container

This repo includes a single-container devcontainer that runs PostgreSQL and Traefik inside the container.

### 1. Reopen in Container

In VS Code, run “Dev Containers: Rebuild and Reopen in Container”.

### 2. Start the app

```bash
pnpm dev
```

### Notes

- Postgres data persists under `.devcontainer/.pgdata/` on your host (gitignored).
- Traefik file-provider config is watched from `.devcontainer/traefik/dynamic/*.yml`. Add local development middlewares there, then reference them as `name@file`.
- The app can read Traefik API status, entrypoints, middlewares, routers, and services when Traefik API is reachable. Set `TRAEFIK_API_URL` in `.env` to point at an external Traefik API; if unset during development, the app defaults to `http://localhost:8080`.
- The container prints helpful URLs and common commands at startup.

### Pre-Push Verification

Before pushing a commit, run the full verification suite from inside the devcontainer:

```bash
pnpm verify
```

This runs the dependency audit, lint, unit tests, Playwright end-to-end and functional API tests, and the production build:

```bash
pnpm audit --audit-level moderate
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

## Traefik Live

The Traefik Live page at `/traefik` uses `TRAEFIK_API_URL` to show API health, live routers/services/middlewares/entrypoints, generated-config drift, and TCP target health checks. Router rows include an Import action that opens the Add Service form with any discovered host, entrypoint, and middleware values prefilled.

## Database Schema

### Services Table
- Service configuration (name, subdomain, target IP/port)
- Authentication method (none, shared_link, sso)
- Enable/disable status
- SSO user/group authorization

### Shared Links Table
- One-time or expiring shared links
- Session duration configuration
- Usage tracking

### Sessions Table
- Active user sessions
- Memory-cached for performance
- Automatic cleanup of expired sessions

### App Config Table
- Application-wide configuration
- SSO provider settings
- Global domain and certificate configuration
- Global middleware settings

## API Endpoints

### Traefik Configuration
- `GET /api/traefik/config` - Dynamic Traefik configuration
- `GET /api/traefik/status` - Traefik API discovery health
- `GET /api/traefik/drift` - Compare app-generated routers/services with live Traefik resources
- `GET /api/traefik/entrypoints` - Discovered Traefik entrypoints
- `GET /api/traefik/middlewares` - Discovered Traefik middlewares
- `GET /api/traefik/routers` - Discovered Traefik routers
- `GET /api/traefik/services` - Discovered Traefik services
- `POST /api/traefik/service-preview` - Preview generated Traefik router/service config for unsaved service form data

### Service Management
- `GET /api/services` - List all services
- `POST /api/services` - Create new service
- `PUT /api/services/[id]` - Update service
- `DELETE /api/services/[id]` - Delete service
- `POST /api/services/share-link` - Generate shared link
- `POST /api/services/test-target` - Test TCP reachability for a service target host/port
- `GET /api/services/health` - Test TCP reachability for configured service targets

### Authentication
- `GET /api/auth/verify` - Forward-auth endpoint for Traefik
- `POST /api/auth/shared-link` - Authenticate with shared link
- `GET /api/auth/sso/login` - Initiate service SSO login
- `GET /api/auth/sso/callback` - Shared SSO callback handler for service and admin sessions
- `GET/POST /api/security/sso-configs` - List or create reusable service SSO provider configs
- `GET/PUT/DELETE /api/security/sso-configs/{id}` - Manage a reusable service SSO provider config
- `GET/PUT /api/auth/admin/sso-config` - Read or update the global admin SSO provider
- `GET /api/auth/admin/status` - Show selected admin auth provider and setup state
- `POST /api/auth/admin/local/setup` - Create the first local admin account
- `POST /api/auth/admin/local/login` - Sign in with a local admin account
- `GET /api/auth/admin/login` - Initiate admin SSO login
- `POST /api/auth/admin/logout` - Clear admin session
- `GET /api/auth/admin/me` - Show current admin session
- `GET/PUT /api/auth/admin/config` - Read or update admin auth provider and role mappings
- `GET/POST /api/auth/admin/users` - List or create local admin users
- `PUT/DELETE /api/auth/admin/users/[username]` - Update or delete local admin users

### Session Management
- `GET /api/sessions` - List active sessions
- `DELETE /api/sessions` - Delete all sessions
- `DELETE /api/sessions/[id]` - Delete specific session

### Global Configuration
- `GET /api/config` - Get global Traefik configuration
- `PUT /api/config` - Update global configuration

## Global Configuration

The admin panel now supports configurable global settings that affect all services:

### Domain Configuration
- **Base Domain**: Set the root domain (e.g., `exposed.example.com`)
- Services become accessible as `{subdomain}.{baseDomain}`
- Supports wildcard certificates for privacy (no service names in CT logs)

### Certificate Management
- **Cert Resolver**: Configurable Traefik certificate resolver name
- Supports DNS challenge mode for wildcard certificates
- Example: `letsencrypt-dns` for `*.exposed.example.com`

### Middleware Configuration
- **Global Middlewares**: Applied to all services automatically
- **Per-Service Middlewares**: Additional middlewares per service
- Order: Global → Auth (if enabled) → HTTPS redirect → Service-specific

### Advanced Service Rules

Each service can also define advanced Traefik JSON when the basic form is not enough:

- **Pass Host header** controls Traefik load balancer `passHostHeader`. Disable it when the upstream must receive the target host instead of the public hostname.
- **Managed Middlewares JSON** creates app-managed middleware definitions under `http.middlewares`, such as `redirectRegex` for redirecting a service root to an admin path.
- **Additional Routers JSON** creates extra routers that point at the same generated backend service. Use this for bypass rules, alternate match rules, router priority, entrypoint overrides, and cert resolver overrides. Set `middlewares: []` on an extra router when it should intentionally bypass the service/global middleware chain.

Example managed middleware:

```json
{
  "redirect-to-admin": {
    "redirectRegex": {
      "regex": "^https?://pihole.example.com/$",
      "replacement": "https://pihole.example.com/admin",
      "permanent": true
    }
  }
}
```

Example additional router:

```json
[
  {
    "name": "api-bypass",
    "rule": "Host(`tautulli.example.com`) && (Header(`X-Api-Key`,`REDACTED`) || Query(`apikey`,`REDACTED`))",
    "entrypoint": "websecure",
    "middlewares": [],
    "certResolver": "cloudflare",
    "priority": 100
  }
]
```

### Service Import and Export

Services can be exported individually from a service row or all at once from the Services header. The exported JSON uses a portable format that omits database IDs and timestamps, includes the referenced domain by domain name, and preserves service routing settings, middleware names, request headers, managed middleware JSON, and additional router JSON.

Import accepts the same JSON format through the Services header. If an imported service conflicts with an existing service name or subdomain, choose whether to rename conflicting services or skip them. Security configuration such as shared links, SSO rules, and basic-auth users is intentionally not included in service exports.

## Traefik Configuration

Configure Traefik to use this service as a configuration provider:

```yaml
# Traefik static configuration (file or args)
providers:
  http:
    endpoints:
      - "http://localhost:3000/api/traefik/config"
    pollInterval: "10s"

# Forward authentication
api:
  dashboard: true

entryPoints:
  web:
    address: ":80"
  websecure:
    address: ":443"

# Optional: configure your certificate resolver for wildcard certificates
certificatesResolvers:
  letsencrypt-dns:  # Match this name in admin panel
    acme:
      email: your-email@example.com
      storage: acme.json
      dnsChallenge:
        provider: cloudflare  # Your DNS provider
        delayBeforeCheck: 10
```

### Example Global Configuration
```json
{
  "certResolver": "letsencrypt-dns",
  "globalMiddlewares": ["compression", "security-headers", "rate-limit"]
}
```

This configuration will:
- Make services accessible as `{service}.exposed.example.com`
- Use wildcard certificate `*.exposed.example.com`
- Apply compression, security headers, and rate limiting to all services

## Authentication Methods

### 1. No Authentication
Services are publicly accessible without any authentication.

### 2. Shared Links
- Generate time-limited, one-use links
- Configurable session duration
- Automatic session creation upon link usage

### 3. SSO Integration
- Configurable OAuth2/OIDC providers
- Group and user-based authorization
- Automatic session management

## SSO Configuration

Admin SSO settings are stored in the `app_config` table as the global admin SSO provider and can be edited from Security -> Admin Authentication. Reusable service SSO provider settings are managed from the Security page and stored in `sso_configs`. Both editors include inline help, an explicit reveal button for stored client secrets, a server-side configuration check, and an interactive login test that reports returned user claims without creating an admin or service session. A Google setup normally uses explicit endpoint URLs: authorization `https://accounts.google.com/o/oauth2/v2/auth`, token `https://oauth2.googleapis.com/token`, userinfo `https://openidconnect.googleapis.com/v1/userinfo`, and scopes `openid profile email`. Generic OIDC providers can use explicit endpoints or an IdP base URL if they expose `/auth`, `/token`, and `/userinfo` under that base.

Reusable service SSO provider shape:

```json
{
  "enabled": true,
  "idpUrl": "https://your-idp.com",
  "clientId": "your-client-id",
  "clientSecret": "your-client-secret",
  "redirectUri": "http://localhost:3000/api/auth/sso/callback",
  "scopes": ["openid", "profile", "groups"]
}
```

## Session Management

- Sessions are stored in PostgreSQL and cached in memory for performance
- Automatic cleanup of expired sessions
- Admin interface for viewing and managing active sessions
- Real-time session validation for Traefik forward-auth

## Development

### Verification

Use the devcontainer for local validation before opening or updating a pull request:

```bash
pnpm verify
```

The Playwright suite includes functional API coverage for service/domain lifecycle behavior, generated Traefik configuration, target reachability testing, service config preview behavior, and the Traefik Live page.

### Database Commands

```bash
# Generate new migration
pnpm db:generate

# Push schema changes
pnpm db:push

# View database in Drizzle Studio
pnpm db:studio
```

### Project Structure

```
src/
├── app/                   # App router pages and API routes
├── components/ui/         # shadcn/ui components
├── hooks/                 # React hooks
└── lib/                   # Server/client utilities and services
    ├── db/                # Database schema and connection
    ├── traefik-config.ts  # Traefik configuration generation
    ├── session-manager.ts # Session management with memory cache
    ├── shared-links.ts    # Shared link utilities
    ├── sso-config.ts      # SSO configuration and handlers
    └── utils.ts           # General utilities
```

## Security Considerations

- All authentication tokens are stored securely with httpOnly cookies
- CSRF protection through state parameters in SSO flows
- Session tokens are cryptographically secure random values
- Forward-auth validation prevents unauthorized access
- Automatic session cleanup prevents token accumulation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run `pnpm verify` inside the devcontainer
6. Submit a pull request

## Fork Notice

This is a community-maintained fork of https://github.com/Janhouse/traefik-proxy-admin.

## License

Copyright (c) 2025 The Traefik Proxy Admin Contributors

This project is licensed under AGPL-3.0-or-later. See LICENSE and NOTICE.

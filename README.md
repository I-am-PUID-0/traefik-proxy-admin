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
```

`TRAEFIK_API_URL` is used by Traefik discovery endpoints (`/api/traefik/status`, `/api/traefik/entrypoints`, `/api/traefik/middlewares`, `/api/traefik/routers`, and `/api/traefik/services`) to populate selectors, validate entered middleware names, show live API health, inspect live resources, and detect drift from generated config. It is not required for `/api/traefik/config`; Traefik can still poll the app-generated dynamic config without it. In production, if `TRAEFIK_API_URL` is unset, middleware discovery is disabled and manual middleware values remain editable. In development, the app falls back to `http://localhost:8080` for the devcontainer Traefik instance.

For production, point `TRAEFIK_API_URL` at an internal Docker network hostname, VPN-only address, or another protected Traefik API endpoint. Do not expose Traefik's API/dashboard publicly without authentication.

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
- `GET /api/auth/sso/login` - Initiate SSO login
- `GET /api/auth/sso/callback` - SSO callback handler

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

SSO settings are managed through the admin panel and stored in the `app_config` table:

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

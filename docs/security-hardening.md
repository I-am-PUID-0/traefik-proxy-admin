# Security Hardening

Traefik Proxy Admin can create Traefik routers, middlewares, forwardAuth hooks, live diagnostics, imports, and target probes. Treat the admin UI and API as privileged infrastructure.

## Production Checklist

Before exposing a production deployment, verify these controls:

- Set a strong `ADMIN_AUTH_SECRET` and keep `ADMIN_AUTH_ENABLED=true`.
- Use `ADMIN_AUTH_PROVIDER=local` until at least one local admin exists and you have verified SSO.
- If SSO is enabled, configure explicit admin role mappings for `viewer`, `editor`, and `admin` users or groups.
- Keep **Allow local account sign-in** enabled only when you want a break-glass local login path.
- Set `ADMIN_COOKIE_DOMAIN` only when the admin UI must share a session across sibling subdomains.
- Set `AUTH_COOKIE_DOMAIN` only when service forwardAuth sessions must work across sibling service subdomains.
- Keep `/api/traefik/config` reachable only by Traefik or an internal network path.
- Point `TRAEFIK_API_URL` at an internal Docker, VPN, or LAN-only Traefik API endpoint.
- Set `SSO_ENDPOINT_ALLOW_HOSTS` only for intentionally internal SSO provider hostnames.
- Set `TARGET_TEST_ALLOW_CIDRS` to the narrow private ranges the app is allowed to probe.
- Do not expose PostgreSQL publicly; use a private Docker network or private host network path.
- Run `pnpm verify` before release or image publication.

## Admin Auth

Admin auth protects the TPA web UI and admin API. It is enabled by default. Production deployments should never rely on the development fallback secret.

Recommended production environment:

```env
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

After initial setup, you can switch the provider to SSO from **Security -> Admin Authentication**. When SSO is selected, **Allow local account sign-in** keeps local admin login available as a break-glass path. Disable it only after you have verified SSO login, role mapping, and another recovery path.

## SSO Role Mapping

If no SSO role mappings are configured, any successfully authenticated SSO user receives `admin`. This is useful for first setup but too permissive for ongoing use.

Recommended pattern:

- Map a small admin group or specific admin email to `admin`.
- Map operators who need to create or modify services to `editor`.
- Map read-only users to `viewer`.
- Keep local admin fallback available for at least one local account during SSO rollout.

## Admin API Request Hardening

Authenticated admin API mutations are checked by the Next proxy before they reach route handlers. The proxy verifies the signed admin session, enforces the route role (`viewer`, `editor`, or `admin`), and blocks cross-site unsafe requests when browser origin metadata indicates a different origin.

High-risk handlers also apply local limits:

- Local admin login and setup, admin SSO login, service SSO login, SSO callback, SSO provider check/test, service import, and target probe endpoints are rate limited per client address.
- Service import, global config updates, generated config previews, SSO provider check/test, and target probes reject oversized JSON bodies before parsing.
- SSO provider test endpoints require an authenticated `admin` session because they can include OAuth client secrets.

These limits are in-memory per app instance and are intended as abuse protection, not as a replacement for reverse-proxy or edge rate limiting.

## Public Endpoints

These endpoints are intentionally public because Traefik or login flows need them:

- `GET /api/traefik/config`: dynamic config consumed by Traefik.
- `GET /api/auth/verify`: Traefik forwardAuth endpoint for protected services.
- SSO login and callback endpoints.
- `GET /api/health`: health checks.

Do not treat those public endpoints as proof the full admin API is public. Admin API routes still require a valid admin session and sufficient role.

## Traefik API Access

`TRAEFIK_API_URL` lets TPA inspect live Traefik resources for selectors, diagnostics, drift, and target health. It should point to an internal API endpoint such as:

```env
TRAEFIK_API_URL=http://traefik:8080
```

Avoid public dashboard/API exposure. If the Traefik API is exposed for operations, protect it independently with network controls and authentication.

## SSO Endpoint Probes

SSO configuration checks and login callbacks make outbound requests to configured provider token and userinfo endpoints. TPA rejects endpoints that resolve to private, local, multicast, or reserved IP ranges unless the hostname is explicitly allowlisted.

For intentionally internal providers, set:

```env
SSO_ENDPOINT_ALLOW_HOSTS=auth.example.internal,authentik.example.internal
```

Only add hostnames you operate and expect TPA to contact. This protects the SSO test/check flow from being used as a generic server-side request primitive.

## Target Probes

Target tests open TCP connections from the TPA server. In production they are disabled unless `TARGET_TEST_ALLOW_CIDRS` is set.

Use the smallest practical CIDR list:

```env
TARGET_TEST_ALLOW_CIDRS=10.0.0.0/24,172.20.0.0/16
```

Do not set broad public ranges. The allowlist is intended for private Docker, VPN, or LAN targets only.

## Cookie Domains

Use host-only cookies unless cross-subdomain behavior is required.

- `ADMIN_COOKIE_DOMAIN` applies to the admin session cookie `tpa-admin-session`.
- `AUTH_COOKIE_DOMAIN` applies to service forwardAuth sessions such as `traefik-session`.

For sibling subdomains, use a parent domain:

```env
ADMIN_COOKIE_DOMAIN=.example.com
AUTH_COOKIE_DOMAIN=.example.com
```

Do not set these values to a broader domain than necessary.

## Secrets

OAuth client secrets are stored in app config and redacted in the UI by default. Use **Reveal** only when rotating or validating an existing secret. Keep database access restricted because stored app configuration contains operational secrets.

## Release Validation

Before publishing a release or Docker image, run:

```bash
pnpm verify
```

At minimum, run:

```bash
pnpm lint
pnpm test
pnpm build
```

# Traefik Proxy Admin

Traefik Proxy Admin is a Next.js admin UI/API for managing Traefik HTTP provider configuration, service exposure, and service authentication. It is operated through a devcontainer in this workspace.

## Current Stack

- pnpm
- Next.js 16 App Router with TypeScript
- React 19
- Node 22 LTS runtime baseline
- Drizzle ORM with PostgreSQL
- shadcn/ui, Radix UI, Tailwind CSS
- Vitest and Playwright
- Traefik HTTP provider integration, with optional live Traefik API discovery

Core code lives under `src/`. API routes live under `src/app/api/`.

## Key Commands

```bash
pnpm dev
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
pnpm verify

pnpm db:generate
pnpm db:migrate
pnpm db:push
pnpm db:studio
```

Before pushing or opening a PR, run `pnpm verify` inside the devcontainer. It runs audit, lint, unit tests, Playwright e2e tests, and production build.

Playwright uses `ADMIN_AUTH_ENABLED=false`. The project has `output: "standalone"`, so e2e web server configuration should run the standalone server instead of `next start`.

## Important Project Notes

- Do not kill or restart the user's running dev server unless explicitly asked.
- Admin auth is secure by default. `ADMIN_AUTH_ENABLED=false` is only for trusted local or CI use.
- Admin auth supports local login and SSO/OIDC through `ADMIN_AUTH_PROVIDER`.
- Admin UI/API sessions use the signed `tpa-admin-session` cookie with viewer/editor/admin roles.
- Service auth sessions use `traefik-session`.
- Service SSO uses DB-backed one-time `tpa-auth-ticket` tickets redeemed by `/api/auth/verify` on the protected service hostname.
- `AUTH_COOKIE_DOMAIN` is optional and should only be used when intentionally sharing service sessions across sibling subdomains.
- `adminPanelDomain` is the internal TPA URL Traefik can reach for forwardAuth.
- `adminPanelPublicUrl` is the browser-facing TPA URL used for OAuth redirects and callbacks.
- Next 16 dev mode behind Traefik requires `allowedDevOrigins`; `NEXT_ALLOWED_DEV_ORIGINS` is documented and `tpa-dev.jberts.world` is currently allowlisted in `next.config.ts`.
- Next 16 Turbopack dev filesystem cache is disabled in `next.config.ts` because bind-mounted `.next/dev/cache/turbopack/*.sst` state can corrupt in the devcontainer and crash dev with `TurbopackInternalError`.

## Core Files

- `src/lib/traefik-config.ts`: generated Traefik HTTP provider config.
- `src/lib/app-config.ts`: app/global configuration helpers.
- `src/lib/session-manager.ts`: service session cache and DB-backed service auth tickets.
- `src/lib/db/schema.ts`: Drizzle schema.
- `src/lib/middleware-utils.ts`: middleware name normalization.
- `src/lib/request-guards.ts`: shared rate/body guards.
- `src/lib/target-test.ts`: target reachability checks with SSRF allowlist validation.
- `src/lib/sso-endpoint-guard.ts`: SSRF guard for outbound SSO endpoint requests.
- `src/lib/sso-provider-presets.ts`: selectable SSO provider presets.
- `src/proxy.ts`: admin auth and same-origin checks for unsafe admin requests.

## Database Tables

Current schema includes:

- `domains`
- `services`
- `service_security_configs`
- `shared_links`
- `sessions`
- `service_auth_tickets`
- `app_config`
- `basic_auth_configs`
- `basic_auth_users`
- `sso_configs`

Services include hostname mode, target, entrypoint, TLS, pass-host-header, middleware, request header, managed middleware, and advanced-router fields.

## Main Capabilities

- Service CRUD and enable/disable scheduling.
- Domain management with subdomain, apex, and custom hostname modes.
- Traefik HTTP provider config at `/api/traefik/config`.
- Traefik Live page at `/traefik` with live API resources, generated-config drift, target health, provider/source/search/status filtering, and external router import.
- External Traefik router import through `/api/traefik/import-preview`, then Add Service draft handoff through sessionStorage plus encoded URL fallback.
- Service import/export using portable JSON format `traefik-proxy-admin.services` v1.
- Global configuration for cert resolver, entrypoints, default service duration, internal Traefik URL, and public browser/OAuth URL.
- Admin authentication management from the Security page.
- Service security configurations for shared links, SSO, and reusable basic-auth configs.
- Reusable service SSO provider configs, with global admin SSO as fallback for legacy service SSO rules.
- Session inventory with search, filter, sort, page-size control, service host display, and stale-session cleanup.

## Authentication Details

Admin authentication:

- `ADMIN_AUTH_ENABLED` defaults on.
- `ADMIN_AUTH_PROVIDER=local` uses local admin users.
- `ADMIN_AUTH_PROVIDER=sso` uses configured global OIDC/SSO.
- Local fallback can be enabled for break-glass access when SSO is selected.
- Admin SSO config is stored in `app_config.sso_config` and configurable through Security -> Admin Authentication.
- SSO editors redact stored client secrets and include Reveal/Hide controls.
- SSO presets include Google, Authelia, Authentik, Keycloak, Microsoft Entra ID, Auth0, Okta, ZITADEL, and Dex.
- SSO test endpoints require authenticated admin access.

Service authentication:

- Shared Link remains an active forwardAuth protection mode. Disabling SSO alone does not make a service public if Shared Link is still enabled.
- Service SSO rules can select reusable `sso_configs`; missing `ssoConfigId` falls back to the global admin SSO provider.
- OAuth state payloads are signed with `ADMIN_AUTH_SECRET`; flow-specific state cookies are still used as compatibility/extra-check paths.
- SSO token/userinfo callback failures should return HTTP 400 with a safe `stage` payload so Cloudflare does not mask useful diagnostics behind a 502.
- Service SSO sessions should prefer email/name claims for `userIdentifier`; fall back to `sub`.
- Reuse an existing active session for the same service/user where possible.

## Form State Rules

shadcn/Radix Selects have caused repeated state bugs. Follow these rules:

- Ignore spurious empty-string `onValueChange` events.
- Map `null`/`undefined` values to UI-friendly sentinels like `forever` or `none`.
- Use `??` instead of `||` when preserving valid `0`, `false`, or explicit `null` values.
- Disable selects until async options are loaded.
- Use correct `useCallback` and `useEffect` dependencies.
- Test fresh create, edit population, async loading, and null/undefined/empty-string cases.
- Config default service duration must preserve explicit `null` as Forever. Only default when the field is absent.
- Add Service must wait for global config defaults before mounting `ServiceForm`; import drafts must not be reset by default-duration loading.

## Traefik Integration Notes

- The published production image contains only the Next app and requires an external `DATABASE_URL`.
- `TRAEFIK_API_URL` is optional and only used for live middleware/router/service/entrypoint discovery, not for generated `/api/traefik/config`.
- In production, missing `TRAEFIK_API_URL` disables live Traefik discovery instead of falling back to localhost.
- In development, live discovery defaults to `http://localhost:8080`.
- Do not set `TRAEFIK_API_URL` in `devcontainer.json` `containerEnv`; it overrides root `.env` for Next.js.
- Devcontainer Traefik should use both the app HTTP provider and file provider. Dynamic middleware files live under `.devcontainer/traefik/dynamic/*.yml`.
- ForwardAuth addresses must use a TPA URL reachable by Traefik itself, not necessarily a browser URL.
- `/api/auth/verify` must not treat itself as the service return URL. Direct or malformed verifier requests should derive the public service URL from service/domain data; real forwardAuth requests with `X-Forwarded-Uri: /` should return 2xx authorization.

## Security Notes

- Unsafe admin requests are protected by same-origin checks in `src/proxy.ts`.
- High-risk login, SSO, import, target probe, preview, and config endpoints use shared rate/body guards.
- Target reachability checks are SSRF-sensitive. `src/lib/target-test.ts` must validate hosts against `TARGET_TEST_ALLOW_CIDRS` before socket connect.
- Production target checks are disabled when `TARGET_TEST_ALLOW_CIDRS` is unset; development defaults to loopback/private ranges.
- Keep the narrow CodeQL suppression on the validated socket sink in `target-test.ts`; do not broaden it to a file-level suppression.
- SSO endpoint requests are SSRF-guarded by `src/lib/sso-endpoint-guard.ts`. Private/local/reserved endpoints require `SSO_ENDPOINT_ALLOW_HOSTS`.

## Release And CI Notes

- Runtime baseline is Node 22 LTS.
- Production Dockerfile uses `node:22-alpine`.
- Devcontainer uses `node:22-bookworm`.
- GitHub Actions use Node 22.
- ESLint must stay on supported 9.x while `eslint-config-next`/plugins are not compatible with ESLint 10.
- Lucide 1.x no longer exports `Github`; use `Code2` for the source-code footer link.
- CI is intentionally PR/manual-only with concurrency cancellation.
- Pushes to `main` run Release Please and CodeQL/default code scanning.
- Docker images build only on published GitHub Releases created by Release Please.
- Release Please config and manifest live under `.github/`.
- Docker releases publish multi-arch images for `linux/amd64` and `linux/arm64`.
- Docker builds require `.dockerignore` to exclude `.devcontainer/.pgdata/`.
- `next.config.ts` build ID generation must tolerate Docker contexts without `.git`.

## Documentation Expectations

- Keep README condensed as overview, quick start, and doc map.
- Durable operator details belong under `docs/`.
- Contributor/development details belong in `CONTRIBUTING.md` and `docs/development.md`.
- Production deployment details belong in `docs/deployment.md`.
- Auth changes should keep README auth summary, `.env.example`, and `docs/authentication.md` aligned.
- UI changes affecting service auth, Traefik import, sessions, config labels, or admin auth should update relevant docs.

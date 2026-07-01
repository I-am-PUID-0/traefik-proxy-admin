# Development

This project is designed to run inside the included VS Code devcontainer. The devcontainer provides Node.js, PostgreSQL, and a local Traefik instance for development.

## Start The Devcontainer

In VS Code, run:

1. **Dev Containers: Rebuild and Reopen in Container**
2. Wait for the container startup message.
3. Start the app:

```bash
pnpm dev
```

The app listens on port `3000`.

## Local Traefik Files

The devcontainer Traefik file provider watches:

```text
.devcontainer/traefik/dynamic/*.yml
```

Add development-only middlewares there, then reference them in services as `name@file`.

## External Traefik API

To point development at another Traefik instance, set `TRAEFIK_API_URL` in your local `.env`:

```env
TRAEFIK_API_URL=http://traefik.example.internal:8080
```

If unset in development, TPA falls back to the devcontainer Traefik API at `http://localhost:8080`.

## Optional Cloudflare Tunnel

The devcontainer can start a Cloudflare Tunnel automatically when a tunnel token is present in your local `.env`. Leave both variables unset to keep `cloudflared` disabled:

```env
CLOUDFLARED_TUNNEL_TOKEN=ey...
# TUNNEL_TOKEN=ey...
```

`TUNNEL_TOKEN` is accepted as an alias for Cloudflare's default naming. The startup script reads only these keys from `.env`; it does not source the entire file.

Point the Cloudflare Tunnel origin at the devcontainer Traefik service entrypoint:

```text
https://localhost:8081
```

Enable **No TLS Verify** in Cloudflare for the local Traefik certificate. Do not point the tunnel at `http://localhost:8080`; that is Traefik's dashboard/API port and can permanently redirect service hostnames to `/dashboard/` in the browser cache.

Cloudflared writes logs to:

```text
/var/log/cloudflared.log
```

Restart the devcontainer after adding or removing the token so `.devcontainer/start-services.sh` can start or stop the managed tunnel process.

## Reverse Proxying Next Dev

When accessing `pnpm dev` through Traefik or another reverse proxy, Next.js blocks dev resources from unknown origins. Add the proxied development host to your local `.env`:

```env
NEXT_ALLOWED_DEV_ORIGINS=tpa-dev.example.com
```

Multiple hosts can be comma-separated:

```env
NEXT_ALLOWED_DEV_ORIGINS=tpa-dev.example.com,tpa-admin.example.test
```

Restart `pnpm dev` after changing this value. Do not hard-code personal hostnames in `next.config.ts`; keep them in local env only.

To diagnose HMR websocket failures, run:

```bash
pnpm dev:check-hmr
```

The check verifies the direct Next dev server, the devcontainer Traefik route, and the public dev route when `NEXT_ALLOWED_DEV_ORIGINS`, `TPA_DEV_HOST`, or `--host` is set. `TPA_DEV_HOST` is only used by the diagnostic command; it does not configure Next.js, so keep `NEXT_ALLOWED_DEV_ORIGINS` set for proxied dev hosts that need to load Next dev resources.

If your proxied host is not in `.env`, pass it at runtime:

```bash
pnpm dev:check-hmr -- --host tpa-dev.example.com
```

Use `--next-url`, `--traefik-url`, or `--public-url` when testing non-default dev ports or an external proxy.

The matching environment variables are:

```env
TPA_DEV_HOST=tpa-dev.example.com
TPA_NEXT_DEV_URL=http://127.0.0.1:3000
TPA_DEV_TRAEFIK_URL=https://127.0.0.1:8081
TPA_DEV_PUBLIC_URL=https://tpa-dev.example.com
```

### Turbopack Cache

Next.js 16 enables Turbopack filesystem caching for development by default. This repo disables that cache in `next.config.ts` because the devcontainer bind mount has triggered corrupted `.next/dev/cache/turbopack/*.sst` state during active UI work. If you see a `TurbopackInternalError` mentioning missing `.sst` files, stop `pnpm dev`, remove `.next/dev`, and restart `pnpm dev`.

## Auth During Development

Admin auth is enabled by default. For normal development, use the local provider and create the first admin from `/auth/login`:

```env
ADMIN_AUTH_PROVIDER=local
ADMIN_AUTH_SECRET=development-admin-auth-secret
```

For temporary local-only test runs, auth can be disabled:

```env
ADMIN_AUTH_ENABLED=false
```

Do not use that setting for production-like testing.

## Devcontainer Traefik Access Logs

The devcontainer starts an internal Traefik process from `.devcontainer/start-services.sh`. It writes common-format access logs to:

```text
/var/log/traefik-access.log
```

`.devcontainer/devcontainer.json` sets `TRAEFIK_ACCESS_LOG_PATH` to that file so the Traefik Live log viewer works without an extra bind mount. If you change these flags while the devcontainer is already running, restart the devcontainer or restart the internal Traefik process for the new access-log settings to take effect.

When development points at an external Traefik via `TRAEFIK_API_URL`, the API URL only covers live discovery. The access-log viewer still needs the log file mounted into the devcontainer and `TRAEFIK_ACCESS_LOG_PATH` pointed at the mounted path. For example, add a devcontainer mount for the host log file and set `TRAEFIK_ACCESS_LOG_PATH=/logs/traefik/access.log`. TPA can parse Traefik JSON logs or the default non-JSON extended common format, so your external Traefik does not need `accessLog.format=json`.

## Verification

Before pushing, run:

```bash
pnpm verify
```

This runs audit, lint, unit tests, Playwright tests, and production build. During active development, these shorter checks are useful:

```bash
pnpm lint
pnpm test
pnpm build
```

## Database

Useful commands:

```bash
pnpm db:generate
pnpm db:push
pnpm db:studio
```

The devcontainer PostgreSQL data directory is bind-mounted at:

```text
.devcontainer/.pgdata/
```

That path is intentionally gitignored.

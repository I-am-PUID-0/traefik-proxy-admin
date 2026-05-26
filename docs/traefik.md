# Traefik Integration

Traefik Proxy Admin integrates with Traefik in two directions:

1. Traefik polls TPA for generated dynamic config.
2. TPA optionally reads the Traefik API for discovery, diagnostics, drift, and target health.

## Dynamic Config Provider

Configure Traefik's HTTP provider to poll TPA:

```yaml
providers:
  http:
    endpoints:
      - "http://traefik-proxy-admin:3000/api/traefik/config"
    pollInterval: "10s"
```

The config endpoint is intentionally public so Traefik can read it. Keep it reachable only by Traefik or an internal network path.

## Forward Authentication

Service shared links and service SSO use Traefik forwardAuth through:

```text
/api/auth/verify
```

TPA has two URL settings for this path:

- **Internal TPA URL for Traefik**: base URL Traefik can reach from its own network. TPA uses this when generating the HTTP provider endpoint and forwardAuth address, such as `http://traefik-proxy-admin:3000`. This often matches Traefik's `providers.http.endpoint` host, but TPA still needs the base URL so generated forwardAuth middleware can point back to TPA.
- **Public TPA URL for Browser/OAuth**: public HTTPS URL users can open in a browser, such as `https://tpa.example.com`. TPA uses this for admin SSO, service SSO redirects, and OAuth callbacks.

Set both when Traefik reaches TPA through an internal container address. If the public URL is missing, service SSO redirects can leak the internal address to the browser.

For service SSO, OAuth providers should redirect back to the Public TPA URL callback. TPA then returns the browser to the protected service with a short-lived auth ticket, and `/api/auth/verify` redeems that ticket on the service hostname. This is what allows service SSO to work across multiple base domains without one shared `AUTH_COOKIE_DOMAIN`; the Public TPA URL does not need to match every protected service domain.

Admin login for the TPA web UI is separate from service forwardAuth. See [Authentication](authentication.md) for the distinction.

## Static Traefik Example

```yaml
api:
  dashboard: true

entryPoints:
  web:
    address: ":80"
  websecure:
    address: ":443"

providers:
  http:
    endpoints:
      - "http://traefik-proxy-admin:3000/api/traefik/config"
    pollInterval: "10s"

certificatesResolvers:
  letsencrypt-dns:
    acme:
      email: admin@example.com
      storage: acme.json
      dnsChallenge:
        provider: cloudflare
        delayBeforeCheck: 10
```

Match the certificate resolver name in TPA domain settings.

## Live Traefik API Discovery

Set `TRAEFIK_API_URL` when TPA should inspect live Traefik resources:

```env
TRAEFIK_API_URL=http://traefik:8080
```

This enables:

- Traefik API health display
- Entrypoint selectors
- Middleware selectors and validation
- Live router/service/middleware/resource views
- Generated-config drift checks
- Target health checks on the Traefik Live page

`TRAEFIK_API_URL` is not required for `GET /api/traefik/config`. Traefik can still consume generated config without live discovery.

In production, point `TRAEFIK_API_URL` at an internal Docker network, private LAN, or VPN-only endpoint. Do not expose Traefik's dashboard/API publicly without separate protection.

## Traefik Live Page

The Traefik Live page at `/traefik` shows live API resources, generated-config drift, and target health checks. It can preview-import external routers into a new TPA-managed service draft.

Import preview resolves the selected router, its referenced load-balancer service, middleware references, and any sibling routers that point at the same Traefik service. Sibling routers are mapped into the draft as advanced routers. The preview does not clone external middleware definitions; it only keeps middleware references such as `chain-auth@file`.

TPA blocks imports from Traefik `@internal` resources. Internal routers and services represent Traefik dashboard/API plumbing and should not become user-managed proxied services.

Review the preview warnings before saving. Complex Traefik services, multiple upstream servers, target URLs with paths, or rules that are not simple `Host(...)` matches may require manual cleanup after the draft is created.


## Access Log Viewer

Set `TRAEFIK_ACCESS_LOG_PATH` when TPA should show a read-only Traefik access log tail on the Traefik Live page:

```env
TRAEFIK_ACCESS_LOG_PATH=/logs/traefik/access.log
```

Mount that file into the TPA container as read-only. The viewer reads the last portion of the file on demand, supports manual refresh and optional live refresh, and filters by search text, method, status family, and loaded line count. The viewer supports Traefik JSON access logs and Traefik default extended Common Log Format. You can keep accessLog.format unset or common for tools such as bouncers that expect non-JSON logs. In common format, TPA extracts the client IP, timestamp, method, path, status, router name, service/server target, and duration when those fields are present.

The log API redacts common sensitive query values such as `token`, `code`, `apikey`, `api_key`, `password`, and `secret` before returning entries. Avoid logging credentials in paths or query strings; redaction is a safety net, not a replacement for clean upstream logging.

## Target Probes

Target checks open TCP connections from the TPA server. In production they are disabled unless `TARGET_TEST_ALLOW_CIDRS` is configured:

```env
TARGET_TEST_ALLOW_CIDRS=10.0.0.0/24,172.20.0.0/16
```

Keep this list narrow and private. See [Security Hardening](security-hardening.md#target-probes).

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

TPA has two admin URL settings for this path:

- **Traefik-Reachable Admin URL**: internal URL Traefik uses for the HTTP provider and forwardAuth calls, such as `http://traefik-proxy-admin:3000`.
- **Browser Public Admin URL**: public HTTPS URL TPA uses when redirecting a user's browser into SSO, such as `https://tpa.example.com`.

Set both when Traefik reaches TPA through an internal container address. If the browser public URL is missing, service SSO redirects can leak the internal address to the browser.

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

The Traefik Live page at `/traefik` shows live API resources, generated-config drift, and target health checks. Router rows can prefill the Add Service form with discovered host, entrypoint, and middleware values.

## Target Probes

Target checks open TCP connections from the TPA server. In production they are disabled unless `TARGET_TEST_ALLOW_CIDRS` is configured:

```env
TARGET_TEST_ALLOW_CIDRS=10.0.0.0/24,172.20.0.0/16
```

Keep this list narrow and private. See [Security Hardening](security-hardening.md#target-probes).

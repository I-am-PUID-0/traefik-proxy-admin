# Comparison: Middleware Manager

This page compares Traefik Proxy Admin with [hhftechnology/middleware-manager](https://github.com/hhftechnology/middleware-manager), a separate Traefik/Pangolin management project. It is intended to help operators choose the right tool, or decide whether both tools belong in the same stack.

Snapshot date: 2026-05-27.

## Short Version

Traefik Proxy Admin is best when you want a production-focused control plane for publishing HTTP services through Traefik with admin authentication, service authentication, sessions, backup/restore, live diagnostics, and generated HTTP-provider config.

Middleware Manager is best when you already have Traefik or Pangolin resources and want to discover them, attach middleware chains, override routers and services, manage Traefik plugins, and apply mTLS-oriented policy without editing raw Traefik YAML by hand.

They overlap around Traefik dynamic configuration, service routing, middleware references, live Traefik visibility, and operator UI. They differ most in ownership model: TPA owns the services it publishes; Middleware Manager overlays or overrides resources discovered from Pangolin or Traefik.

## High-Level Fit

| Question | Traefik Proxy Admin | Middleware Manager |
| --- | --- | --- |
| Primary job | Publish and protect HTTP services through Traefik | Manage middleware, router, service, plugin, and mTLS overlays for Traefik/Pangolin resources |
| Best starting point | "I have upstream services and want a safer UI to expose them" | "I already have Traefik/Pangolin resources and want to modify policy around them" |
| Source of truth | TPA database plus generated Traefik HTTP-provider config | Pangolin API or Traefik API as discovered source, plus Middleware Manager state and generated override config |
| Traefik integration | Traefik polls `GET /api/traefik/config` | Traefik polls `GET /api/v1/traefik-config` and/or watches generated rules depending on deployment |
| State storage | PostgreSQL | SQLite database path such as `/data/middleware.db` |
| Admin UI security | Built-in admin auth, local users, optional admin SSO, roles, cookies, CSRF/same-origin checks | Not a primary advertised capability in the public docs reviewed; secure by network placement or an external auth layer |
| Service auth | Built-in shared links, reusable Basic Auth, reusable service SSO, forwardAuth sessions, Bypass Rules | Can create and attach Traefik auth middlewares such as ForwardAuth or BasicAuth, but does not appear to own user/session flows itself |
| Plugin/static config management | Does not install Traefik plugins or edit Traefik static config | Plugin Hub can install/manage Traefik plugins and requires access to Traefik static config |
| mTLS focus | Possible through externally defined Traefik config/middlewares, but not a first-class TPA workflow | First-class mTLS/resource workflow using `mtlswhitelist` according to its docs |
| Pangolin fit | No native Pangolin API integration | Native Pangolin data-source mode |
| Backup/restore | Full replace-mode backup/restore for app config, domains, services, auth configs, shared links, secrets, and admin auth config | Persistence through SQLite and mounted config/data; public docs emphasize backups and persistence rather than a comparable full in-app restore workflow |

## Product Shape

TPA is a service publishing app. A TPA service combines a hostname, target upstream, optional middlewares, optional authentication, and generated Traefik router/service config. Domains are first-class objects, and service auth is part of the product rather than something the operator must assemble only from Traefik primitives.

Middleware Manager is a Traefik resource policy app. Its docs describe discovering resources from Pangolin or Traefik, attaching middleware chains with priority, changing HTTP/TCP router settings, assigning custom services, installing plugins, and enabling mTLS per resource. It is closer to an overlay editor for an existing Traefik estate.

The difference matters operationally:

- In TPA, disabling a service removes that service from TPA's generated config.
- In Middleware Manager, the underlying Pangolin or Traefik resource can still exist, while Middleware Manager contributes overrides or generated dynamic config around it.
- In TPA, auth sessions, SSO tickets, shared links, admin users, and backup data are application-owned.
- In Middleware Manager, Traefik middleware behavior is the central abstraction, so the operator composes protections from Traefik middleware definitions and plugin behavior.

## Feature Comparison

| Area | TPA | Middleware Manager |
| --- | --- | --- |
| Service CRUD | Create, edit, disable, import, export TPA-managed services | Create custom Traefik services and assign them as overrides to resources |
| Domains | Reusable domain objects with certificate resolver and wildcard behavior | Router TLS/SAN controls on discovered resources |
| HTTP routers | Generated from service/domain state; additional routers JSON for advanced cases | Resource router controls including entrypoints, SANs, headers, priority, TCP SNI |
| TCP/UDP | TPA is focused on HTTP service publishing | Public docs call out HTTP, TCP, and UDP service handling |
| Middlewares | References live or manual middlewares; can define service-managed middleware JSON | Core workflow: create, template, assign, order, and manage middlewares |
| Advanced Traefik services | Normal HTTP load-balancer target per service; additional routers target the same generated service | Custom loadBalancer, weighted, mirroring, and failover service definitions |
| Live discovery | Traefik API status, entrypoints, routers, services, middlewares, drift, target health | Dashboard/resource discovery from Pangolin or Traefik plus Traefik Explorer |
| Import | Preview-import external Traefik routers into TPA service drafts | Discovers external resources and applies overrides rather than importing them into a TPA-style service model |
| Access logs | Optional admin-only Traefik access-log viewer with sensitive query redaction | Public docs mention access-log guidance, but not the same in-app log viewer model |
| Templates | Form defaults and managed config patterns | Middleware and service template libraries are first-class |

## Authentication And Security

TPA has two explicit authentication surfaces:

- Admin authentication protects the TPA UI/API with local users or SSO/OIDC, viewer/editor/admin roles, signed cookies, and lockout recovery guidance.
- Service authentication protects proxied services through Traefik forwardAuth, with shared links, reusable Basic Auth, reusable service SSO providers, service sessions, Bypass Rules, and observed bypass tracking.

Middleware Manager appears more focused on configuring Traefik's security capabilities than being an identity/session product itself. Its public docs and README emphasize ForwardAuth, BasicAuth, headers, rate limits, IP allowlisting, plugins, and mTLS. That is powerful, but the operator remains responsible for the identity provider, auth middleware backend, session behavior, and protecting the Middleware Manager UI/API unless a deployment adds those controls externally.

That makes TPA more opinionated and batteries-included for publishing private web apps. Middleware Manager is more flexible when the goal is to shape Traefik policy around resources that already exist.

## Plugin And Static Config Boundary

TPA deliberately stays on the dynamic HTTP-provider side of Traefik. It generates routers, services, middlewares, forwardAuth hooks, and related dynamic config. It does not install Traefik plugins or mutate Traefik static config.

Middleware Manager crosses that boundary for plugin workflows. Its docs describe `TRAEFIK_STATIC_CONFIG_PATH` as required for plugin install/remove and mTLS plugin checks. That unlocks workflows TPA does not attempt, but it also means the deployment must mount Traefik's static config into Middleware Manager and treat that access as high privilege.

Use Middleware Manager when plugin lifecycle is a requirement. Use TPA when you want the admin app to stay away from Traefik static config and operate through generated dynamic config.

## Operational Model

TPA expects PostgreSQL and treats backup/restore as an application feature. Its backup format includes app config, domains, services, service security configs, shared links, reusable Basic Auth and SSO provider configs, password hashes, OAuth client secrets, and admin auth config. Active sessions and one-time tickets are intentionally excluded.

Middleware Manager uses SQLite state and mounted configuration/data paths. Its docs emphasize keeping the container running to keep override middleware deployed, mounting the rules/config/static-config directories correctly, and choosing Pangolin or Traefik as the active data source.

In practice:

- TPA has heavier infrastructure expectations, but stronger app-level recovery and auth state management.
- Middleware Manager is lighter to place next to Pangolin/Traefik, but its correctness depends heavily on mounted paths and the active data source matching the real Traefik deployment.

## When To Choose TPA

Choose TPA when:

- You want a self-contained UI for exposing private HTTP services.
- Built-in admin login, admin SSO, service SSO, shared links, Basic Auth, and session visibility matter.
- You want full backup/restore of service and auth configuration.
- You want generated-config drift checks, target reachability tests, Traefik API discovery, and optional access-log viewing.
- You do not need the app to install Traefik plugins or edit Traefik static config.

TPA is especially suitable for operators who want a safer, production-oriented service publication workflow rather than direct editing of Traefik dynamic config.

## When To Choose Middleware Manager

Choose Middleware Manager when:

- Pangolin already owns the resource model and you want to add Traefik policy around those resources.
- You need first-class middleware chain editing, middleware templates, plugin management, or per-resource mTLS workflows.
- You need to override existing routers/services rather than recreate them as TPA-managed services.
- You need custom Traefik service types such as weighted, mirroring, or failover.
- TCP/UDP resource tuning is part of the requirement.

Middleware Manager is especially suitable for Pangolin-heavy stacks and advanced Traefik operators who want a UI over middleware and router policy.

## Could They Run Together?

They can coexist only with clear ownership boundaries.

A safer split is:

- TPA owns TPA-created services through its HTTP-provider endpoint.
- Middleware Manager manages Pangolin-created resources or a separate set of Traefik resources.
- Shared middlewares from the Traefik file provider can be referenced by TPA services when needed.
- Traefik static plugin configuration remains owned by Traefik or Middleware Manager, not TPA.

Avoid having both tools generate competing routers for the same hostname unless you deliberately control priorities and know which router should win. Also avoid letting one tool import or override the other's generated resources as if they were hand-managed Traefik config.

## Practical Gaps To Watch

TPA gaps compared with Middleware Manager:

- No Traefik Plugin Hub or static-config editing.
- No first-class mTLS workflow.
- Less focus on arbitrary Traefik service types such as weighted, mirroring, failover, TCP, and UDP.
- No Pangolin API data source.

Middleware Manager gaps compared with TPA:

- No comparable built-in admin auth and role model found in the public docs reviewed.
- No comparable built-in service SSO/shared-link/session product found in the public docs reviewed.
- No comparable full application backup/restore workflow found in the public docs reviewed.
- Less focused on domain/service publication as a guided product flow.

## Sources Reviewed

- [Middleware Manager GitHub README](https://github.com/hhftechnology/middleware-manager)
- [Middleware Manager hosted docs](https://middleware-manager.hhf.technology/)
- [Middleware Manager onboarding](https://middleware-manager.hhf.technology/docs/getting-started/onboarding)
- [Middleware Manager standalone Traefik deployment](https://middleware-manager.hhf.technology/docs/getting-started/deploy-standalone)
- [Middleware Manager resources and routers](https://middleware-manager.hhf.technology/docs/ui-guides/resources)
- [TPA README](../README.md)
- [TPA Authentication](authentication.md)
- [TPA Service Configuration](services.md)
- [TPA Traefik Integration](traefik.md)
- [TPA Security Hardening](security-hardening.md)

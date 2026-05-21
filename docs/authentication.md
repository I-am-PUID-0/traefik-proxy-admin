# Authentication

Traefik Proxy Admin has two different authentication surfaces:

1. **Admin authentication** protects the TPA web UI and admin API.
2. **Service authentication** protects proxied services through Traefik forwardAuth.

Both are important. Admin auth protects the tool that can create routers, middlewares, target probes, imports, and Traefik dynamic config. Service auth protects the individual applications exposed through Traefik.

## Admin Authentication

Admin authentication is enabled by default. To disable it for trusted local development or CI only, set:

```env
ADMIN_AUTH_ENABLED=false
```

Production deployments should set a strong signing secret:

```env
ADMIN_AUTH_SECRET=<long-random-secret>
```

TPA supports selectable admin auth providers:

```env
ADMIN_AUTH_PROVIDER=local
# or
ADMIN_AUTH_PROVIDER=sso
```

If `ADMIN_AUTH_PROVIDER` is omitted, TPA defaults to `local`. When SSO is selected, enable `allowLocalFallback` from **Security -> Admin Authentication** to keep local account sign-in available as a break-glass path.

### Local Provider

Local auth is the DUMB-style path. On first start, open `/auth/login` and create the first local admin account. The first account is assigned the `admin` role and is stored in the app config as a bcrypt password hash.

Use local auth when you want TPA to be self-contained or you do not want admin access coupled to an external identity provider. After the first account exists, manage local users from **Security -> Admin Authentication**. The panel can add users, change roles, disable users, reset passwords, and delete users while preventing removal of the last enabled local admin.

Local auth endpoints:

- `GET /api/auth/admin/status` reports provider and setup state.
- `POST /api/auth/admin/local/setup` creates the first local admin account.
- `POST /api/auth/admin/local/login` signs in a local admin user.
- `POST /api/auth/admin/logout` clears the admin session cookie.
- `GET /api/auth/admin/me` returns the current signed admin session.
- `GET/POST /api/auth/admin/users` lists or creates local admin users.
- `PUT/DELETE /api/auth/admin/users/{username}` updates or deletes local admin users.

### SSO Provider

SSO admin auth uses the global OIDC provider configuration in app config. Service SSO can use separate reusable provider configs per service, but admin login currently uses the global provider so there is one predictable control point for TPA operator access.

Set:

```env
ADMIN_AUTH_PROVIDER=sso
ADMIN_AUTH_SECRET=<long-random-secret>
```

Then configure the global SSO provider from **Security -> Admin Authentication -> Global Admin SSO Provider**. It is stored in app config key `sso_config`. Stored client secrets are redacted by default; use the editor's **Reveal** button when an admin needs to inspect or rotate an existing secret. Use **Check configuration** to validate endpoint shape/reachability, and **Test login** to run an interactive OAuth flow from the unsaved values on the form. The callback URL must point back to TPA:

```text
https://<tpa-host>/api/auth/sso/callback
```

The provider config shape is:

```json
{
  "enabled": true,
  "idpUrl": "https://accounts.google.com/o/oauth2/v2",
  "authorizationUrl": "https://accounts.google.com/o/oauth2/v2/auth",
  "tokenUrl": "https://oauth2.googleapis.com/token",
  "userinfoUrl": "https://openidconnect.googleapis.com/v1/userinfo",
  "clientId": "...",
  "clientSecret": "...",
  "redirectUri": "https://tpa.example.com/api/auth/sso/callback",
  "scopes": ["openid", "profile", "email"]
}
```

For providers that expose groups, include the group scope required by that provider and map those group names into admin roles. Manage the global provider, selected admin auth provider, session duration, and SSO role mappings from **Security -> Admin Authentication**.

Field guide:

- **Client ID**: OAuth/OIDC application ID from the identity provider.
- **Client secret**: OAuth/OIDC application secret. Leave blank while editing to keep the stored secret, or use **Reveal** to inspect it.
- **Redirect URI**: must exactly match the callback URL registered with the provider.
- **Scopes**: space-separated list. Start with `openid profile email`; add provider-specific group scopes only when role mapping needs groups.
- **IdP base URL**: optional shortcut used only when the provider exposes `/auth`, `/token`, and `/userinfo` below the same base URL.
- **Authorization URL**, **Token URL**, **Userinfo URL**: explicit OIDC endpoints. Prefer these for Google.

Google endpoint example:

```text
Authorization URL: https://accounts.google.com/o/oauth2/v2/auth
Token URL: https://oauth2.googleapis.com/token
Userinfo URL: https://openidconnect.googleapis.com/v1/userinfo
Scopes: openid profile email
```

### Admin Roles

Admin sessions use a signed `tpa-admin-session` cookie. The session contains one role:

- `viewer`: read-only UI and API access.
- `editor`: viewer access plus mutating service operations.
- `admin`: editor access plus security, session, and global configuration operations.

Admin auth settings live in app config key `admin_auth_config`. The config supports provider selection, session duration, local users, and SSO role rules.

Example SSO role mapping:

```json
{
  "enabled": true,
  "provider": "sso",
  "allowLocalFallback": true,
  "sessionDurationHours": 8,
  "roles": {
    "viewer": { "users": [], "groups": ["tpa-viewers"] },
    "editor": { "users": [], "groups": ["tpa-editors"] },
    "admin": { "users": ["admin@example.com"], "groups": ["tpa-admins"] }
  },
  "localUsers": []
}
```

If SSO is selected and no role mappings are configured, any successfully authenticated SSO user receives `admin`. That makes first setup possible, but you should add explicit user/group role rules immediately.

## Service Authentication

Service SSO, shared links, and service Basic Auth are separate from admin auth. They are applied per service and enforced by Traefik forwardAuth through:

```text
/api/auth/verify
```

The **Service SSO Configurations** section on the Security page creates reusable OAuth/OIDC provider configs for proxied services. Each service SSO rule can choose one provider config and then apply its own allowed users/groups. If a service SSO rule has no provider selected, TPA falls back to the global admin SSO provider in `sso_config` for backward compatibility. Reusable service provider secrets are also redacted by default and can be revealed from the edit dialog. The reusable provider dialog includes the same **Check configuration** and **Test login** actions, so service SSO providers can be validated before saving or attaching them to a service.

A reusable service SSO provider supports explicit OIDC endpoint URLs, which is the preferred setup for providers like Google:

```text
Authorization URL: https://accounts.google.com/o/oauth2/v2/auth
Token URL: https://oauth2.googleapis.com/token
Userinfo URL: https://openidconnect.googleapis.com/v1/userinfo
```

When a service has SSO security enabled and the browser has no valid `traefik-session`, TPA redirects the browser through:

```text
/api/auth/sso/login -> provider -> /api/auth/sso/callback
```

After callback, TPA validates the service-level allowed users/groups against the selected provider response and sets `traefik-session`.

### Service Basic Auth

The **Service Basic Auth Configurations** section on the Security page creates reusable HTTP Basic Authentication credential sets for proxied services. These credentials are not TPA admin users and cannot sign in to the TPA web UI.

A basic-auth config contains one or more usernames/passwords. Attach a config from a service Security page to make Traefik challenge visitors before forwarding requests to that service. This is useful for simple browser-password protection on one or more services, while admin auth continues to protect TPA itself.

If TPA and protected services use sibling subdomains, set a parent cookie domain so the service request includes the forwardAuth session cookie:

```env
AUTH_COOKIE_DOMAIN=.example.com
```

Admin cookies can use their own parent domain when needed:

```env
ADMIN_COOKIE_DOMAIN=.example.com
```

## Public Endpoints

Admin auth intentionally does not protect every route. These endpoints remain public by design:

- `GET /api/traefik/config`: Traefik needs to poll generated dynamic config.
- `GET /api/auth/verify`: Traefik forwardAuth endpoint for service requests.
- SSO/login/callback endpoints needed to complete authentication.
- `GET /api/health` for health checks.

Keep `/api/traefik/config` reachable only from Traefik or an internal network path.

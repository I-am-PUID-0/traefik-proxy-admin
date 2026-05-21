export type SsoProviderPresetId =
  | "custom"
  | "google"
  | "authelia"
  | "authentik"
  | "keycloak"
  | "microsoft-entra"
  | "auth0"
  | "okta"
  | "zitadel"
  | "dex";

export type SsoProviderPresetValues = {
  idpUrl?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  userinfoUrl?: string;
  scopes?: string;
};

export const SSO_PROVIDER_PRESETS: Array<{
  id: SsoProviderPresetId;
  name: string;
  description: string;
  values: SsoProviderPresetValues;
}> = [
  {
    id: "custom",
    name: "Custom / Generic OIDC",
    description: "Manual provider settings. Use explicit endpoints or an IdP base URL.",
    values: {},
  },
  {
    id: "google",
    name: "Google",
    description: "Google OAuth/OIDC endpoint URLs and default OpenID scopes.",
    values: {
      idpUrl: "",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userinfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
      scopes: "openid profile email",
    },
  },
  {
    id: "authelia",
    name: "Authelia",
    description: "Authelia OIDC endpoint paths. Replace auth.example.com with your Authelia root URL.",
    values: {
      idpUrl: "",
      authorizationUrl: "https://auth.example.com/api/oidc/authorization",
      tokenUrl: "https://auth.example.com/api/oidc/token",
      userinfoUrl: "https://auth.example.com/api/oidc/userinfo",
      scopes: "openid profile email groups",
    },
  },
  {
    id: "authentik",
    name: "Authentik",
    description: "Authentik OAuth2/OIDC endpoint paths. Replace authentik.example.com with your Authentik root URL.",
    values: {
      idpUrl: "",
      authorizationUrl: "https://authentik.example.com/application/o/authorize/",
      tokenUrl: "https://authentik.example.com/application/o/token/",
      userinfoUrl: "https://authentik.example.com/application/o/userinfo/",
      scopes: "openid profile email",
    },
  },
  {
    id: "keycloak",
    name: "Keycloak",
    description: "Keycloak realm OIDC endpoints. Replace keycloak.example.com and myrealm.",
    values: {
      idpUrl: "",
      authorizationUrl: "https://keycloak.example.com/realms/myrealm/protocol/openid-connect/auth",
      tokenUrl: "https://keycloak.example.com/realms/myrealm/protocol/openid-connect/token",
      userinfoUrl: "https://keycloak.example.com/realms/myrealm/protocol/openid-connect/userinfo",
      scopes: "openid profile email",
    },
  },
  {
    id: "microsoft-entra",
    name: "Microsoft Entra ID",
    description: "Microsoft identity platform v2 endpoints. Replace tenant-id-or-domain with your tenant.",
    values: {
      idpUrl: "",
      authorizationUrl: "https://login.microsoftonline.com/tenant-id-or-domain/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/tenant-id-or-domain/oauth2/v2.0/token",
      userinfoUrl: "https://graph.microsoft.com/oidc/userinfo",
      scopes: "openid profile email",
    },
  },
  {
    id: "auth0",
    name: "Auth0",
    description: "Auth0 OIDC endpoints. Replace tenant.auth0.com with your Auth0 domain.",
    values: {
      idpUrl: "",
      authorizationUrl: "https://tenant.auth0.com/authorize",
      tokenUrl: "https://tenant.auth0.com/oauth/token",
      userinfoUrl: "https://tenant.auth0.com/userinfo",
      scopes: "openid profile email",
    },
  },
  {
    id: "okta",
    name: "Okta",
    description: "Okta authorization server endpoints. Replace dev-000000.okta.com and default as needed.",
    values: {
      idpUrl: "",
      authorizationUrl: "https://dev-000000.okta.com/oauth2/default/v1/authorize",
      tokenUrl: "https://dev-000000.okta.com/oauth2/default/v1/token",
      userinfoUrl: "https://dev-000000.okta.com/oauth2/default/v1/userinfo",
      scopes: "openid profile email",
    },
  },
  {
    id: "zitadel",
    name: "ZITADEL",
    description: "ZITADEL OIDC endpoints. Replace zitadel.example.com with your custom domain.",
    values: {
      idpUrl: "",
      authorizationUrl: "https://zitadel.example.com/oauth/v2/authorize",
      tokenUrl: "https://zitadel.example.com/oauth/v2/token",
      userinfoUrl: "https://zitadel.example.com/oidc/v1/userinfo",
      scopes: "openid profile email",
    },
  },
  {
    id: "dex",
    name: "Dex",
    description: "Dex OIDC endpoints. Replace dex.example.com with your Dex issuer URL.",
    values: {
      idpUrl: "",
      authorizationUrl: "https://dex.example.com/auth",
      tokenUrl: "https://dex.example.com/token",
      userinfoUrl: "https://dex.example.com/userinfo",
      scopes: "openid profile email groups",
    },
  },
];

export function getSsoProviderPreset(id: SsoProviderPresetId) {
  return SSO_PROVIDER_PRESETS.find((preset) => preset.id === id) || SSO_PROVIDER_PRESETS[0];
}

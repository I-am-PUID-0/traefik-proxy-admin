export type SsoProviderPresetId = "custom" | "google";

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
];

export function getSsoProviderPreset(id: SsoProviderPresetId) {
  return SSO_PROVIDER_PRESETS.find((preset) => preset.id === id) || SSO_PROVIDER_PRESETS[0];
}

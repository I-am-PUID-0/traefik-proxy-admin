export const SSO_STATE_COOKIES = {
  admin: {
    data: "admin_sso_state",
    token: "admin_sso_state_token",
  },
  service: {
    data: "service_sso_state",
    token: "service_sso_state_token",
  },
  test: {
    data: "test_sso_state",
    token: "test_sso_state_token",
  },
} as const;

export const LEGACY_SSO_STATE_COOKIES = {
  data: "sso_state",
  token: "sso_state_token",
} as const;

import type { SsoConfig } from "@/lib/db/schema";

export interface CreateSsoConfigRequest {
  name: string;
  description?: string | null;
  enabled?: boolean;
  idpUrl?: string | null;
  authorizationUrl?: string | null;
  tokenUrl?: string | null;
  userinfoUrl?: string | null;
  clientId: string;
  clientSecret: string;
  tokenEndpointAuthMethod?: "client_secret_post" | "client_secret_basic";
  redirectUri: string;
  scopes?: string[];
}

export interface UpdateSsoConfigRequest extends Partial<CreateSsoConfigRequest> {
  name: string;
  clientId: string;
  redirectUri: string;
}

export interface SsoConfigResponse extends Omit<SsoConfig, "clientSecret" | "scopes"> {
  scopes: string[];
  clientSecret?: string;
  hasClientSecret: boolean;
}

export interface SsoConfigData {
  name: string;
  description?: string | null;
  enabled: boolean;
  idpUrl?: string | null;
  authorizationUrl?: string | null;
  tokenUrl?: string | null;
  userinfoUrl?: string | null;
  clientId: string;
  clientSecret?: string;
  tokenEndpointAuthMethod?: "client_secret_post" | "client_secret_basic";
  redirectUri: string;
  scopes: string[];
}

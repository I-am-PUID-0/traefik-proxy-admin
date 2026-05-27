import type { Service } from "@/lib/db/schema";

// Hostname mode types
export type HostnameMode = 'subdomain' | 'apex' | 'custom';

// Request DTOs
export interface CreateServiceRequest {
  name: string;
  subdomain?: string;
  hostnameMode: HostnameMode;
  customHostnames?: string[] | string | null; // Array, JSON string, or text list of hostnames for custom mode
  domainId: string;
  targetIp: string;
  targetPort: number;
  entrypoint?: string;
  isHttps?: boolean;
  insecureSkipVerify?: boolean;
  passHostHeader?: boolean;
  enabled?: boolean;
  enableDurationMinutes?: number | null;
  middlewares?: string[];
  requestHeaders?: Record<string, string> | string | null;
  managedMiddlewares?: Record<string, unknown> | string | null;
  advancedRouters?: unknown[] | string | null;
}

export interface UpdateServiceRequest {
  name: string;
  subdomain?: string;
  hostnameMode: HostnameMode;
  customHostnames?: string[] | string | null; // Array, JSON string, or text list of hostnames for custom mode
  domainId: string;
  targetIp: string;
  targetPort: number;
  entrypoint?: string;
  isHttps?: boolean;
  insecureSkipVerify?: boolean;
  passHostHeader?: boolean;
  enabled?: boolean;
  enableDurationMinutes?: number | null;
  middlewares?: string[];
  requestHeaders?: Record<string, string> | string | null;
  managedMiddlewares?: Record<string, unknown> | string | null;
  advancedRouters?: unknown[] | string | null;
}

// Response DTOs
export interface ServiceResponse extends Service {
  parsedCustomHostnames?: string[]; // Parsed from JSON string
  parsedMiddlewares?: string[]; // Parsed from JSON string
  parsedRequestHeaders?: Record<string, string>; // Parsed from JSON string
}

// Service DTOs (internal)
export interface CreateServiceData {
  name: string;
  subdomain?: string | null;
  hostnameMode: HostnameMode;
  customHostnames?: string | null; // JSON string
  domainId: string;
  targetIp: string;
  targetPort: number;
  entrypoint?: string | null;
  isHttps: boolean;
  insecureSkipVerify: boolean;
  passHostHeader: boolean;
  enabled: boolean;
  enableDurationMinutes?: number | null;
  middlewares?: string | null; // JSON string
  requestHeaders?: string | null; // JSON string
  managedMiddlewares?: string | null; // JSON string
  advancedRouters?: string | null; // JSON string
}

export interface UpdateServiceData {
  name: string;
  subdomain?: string | null;
  hostnameMode: HostnameMode;
  customHostnames?: string | null; // JSON string
  domainId: string;
  targetIp: string;
  targetPort: number;
  entrypoint?: string | null;
  isHttps: boolean;
  insecureSkipVerify: boolean;
  passHostHeader: boolean;
  enabled: boolean;
  enableDurationMinutes?: number | null;
  middlewares?: string | null; // JSON string
  requestHeaders?: string | null; // JSON string
  managedMiddlewares?: string | null; // JSON string
  advancedRouters?: string | null; // JSON string
}
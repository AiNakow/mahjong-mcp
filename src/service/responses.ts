import type { ServiceError, ServiceWarning } from "./errors.ts";

export const ADAPTER_API_VERSION = "v1";
export const ENGINE_VERSION = "0.1.0";

export type ServiceSource =
  | "library"
  | "cli"
  | "http"
  | "mcp"
  | "openai_tool"
  | "anthropic_tool";

export interface ServiceMeta {
  apiVersion: typeof ADAPTER_API_VERSION;
  engineVersion: string;
  elapsedMs: number;
  source: ServiceSource;
  requestId?: string;
}

export interface ServiceSuccess<T> {
  ok: true;
  data: T;
  warnings: ServiceWarning[];
  meta: ServiceMeta;
}

export interface ServiceFailure {
  ok: false;
  error: ServiceError;
  warnings: ServiceWarning[];
  meta: ServiceMeta;
}

export type ServiceResult<T> = ServiceSuccess<T> | ServiceFailure;


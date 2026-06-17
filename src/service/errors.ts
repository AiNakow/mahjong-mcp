import { TileParseError } from "../core/tile.ts";
import { HandTextParseError } from "./parse-hand.ts";

export type ServiceErrorCode =
  | "invalid_input"
  | "invalid_tile"
  | "invalid_hand"
  | "invalid_state"
  | "invalid_context"
  | "unsupported"
  | "not_implemented"
  | "internal_error";

export interface ServiceError {
  code: ServiceErrorCode;
  message: string;
  details?: unknown;
  retryable: boolean;
}

export interface ServiceWarning {
  code: string;
  message: string;
  details?: unknown;
}

export class MahjongServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly details?: unknown;
  readonly retryable: boolean;

  constructor(code: ServiceErrorCode, message: string, options: {
    details?: unknown;
    retryable?: boolean;
  } = {}) {
    super(message);
    this.name = "MahjongServiceError";
    this.code = code;
    this.details = options.details;
    this.retryable = options.retryable ?? false;
  }
}

export function toServiceError(error: unknown): ServiceError {
  if (error instanceof MahjongServiceError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
      retryable: error.retryable,
    };
  }
  if (error instanceof TileParseError) {
    return {
      code: "invalid_tile",
      message: error.message,
      retryable: false,
    };
  }
  if (error instanceof HandTextParseError) {
    return {
      code: "invalid_hand",
      message: error.message,
      retryable: false,
    };
  }
  if (error instanceof Error) {
    const invalidContext = error.message.includes("invalid_context")
      || error.message.includes("上下文")
      || error.message.includes("矛盾");
    return {
      code: invalidContext ? "invalid_context" : "invalid_input",
      message: error.message,
      retryable: false,
    };
  }
  return {
    code: "internal_error",
    message: "未预期的内部错误。",
    details: error,
    retryable: false,
  };
}


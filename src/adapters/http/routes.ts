import type { IncomingMessage, ServerResponse } from "node:http";
import {
  analyzeHandRequest,
  analyzeNanikiruRequest,
  chooseActionRequest,
  estimateRequest,
  parseScreenshotRequest,
  scoreHandRequest,
} from "../../service/facade.ts";
import { ADAPTER_API_VERSION, ENGINE_VERSION, type ServiceFailure, type ServiceResult } from "../../service/responses.ts";
import { buildOpenApiDocument } from "./openapi.ts";

const MAX_BODY_BYTES = 1024 * 1024;

export async function handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://localhost");
    if (method === "GET" && url.pathname === "/health") {
      writeJson(res, 200, {
        ok: true,
        apiVersion: ADAPTER_API_VERSION,
        engineVersion: ENGINE_VERSION,
      });
      return;
    }
    if (method === "GET" && url.pathname === "/openapi.json") {
      writeJson(res, 200, buildOpenApiDocument());
      return;
    }
    if (method !== "POST") {
      writeJson(res, 404, { ok: false, error: { code: "not_found", message: "Not found" } });
      return;
    }

    const body = await readJsonBody(req);
    const result = dispatchPost(url.pathname, body);
    writeJson(res, statusForResult(result), result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeJson(res, message.includes("too large") ? 413 : 400, {
      ok: false,
      error: {
        code: "invalid_input",
        message,
        retryable: false,
      },
    });
  }
}

export function dispatchPost(pathname: string, body: unknown): ServiceResult<unknown> {
  if (pathname === "/v1/mahjong/analyze-hand") {
    return analyzeHandRequest(body as never, { source: "http" });
  }
  if (pathname === "/v1/mahjong/nanikiru") {
    return analyzeNanikiruRequest(body as never, { source: "http" });
  }
  if (pathname === "/v1/mahjong/score-hand") {
    return scoreHandRequest(body as never, { source: "http" });
  }
  if (pathname === "/v1/mahjong/choose-action") {
    return chooseActionRequest(body as never, { source: "http" });
  }
  if (pathname === "/v1/mahjong/estimate") {
    return estimateRequest(body as never, { source: "http" });
  }
  if (pathname === "/v1/mahjong/parse-screenshot") {
    return parseScreenshotRequest(body as never, { source: "http" });
  }
  return {
    ok: false,
    error: {
      code: "invalid_input",
      message: "未知 HTTP 路由。",
      retryable: false,
    },
    warnings: [],
    meta: {
      apiVersion: ADAPTER_API_VERSION,
      engineVersion: ENGINE_VERSION,
      elapsedMs: 0,
      source: "http",
    },
  };
}

function statusForResult(result: ServiceResult<unknown>): number {
  if (result.ok) {
    return 200;
  }
  const failure = result as ServiceFailure;
  if (failure.error.code === "not_implemented") {
    return 501;
  }
  if (failure.error.code === "invalid_context") {
    return 422;
  }
  if (failure.error.code === "internal_error") {
    return 500;
  }
  return 400;
}

function writeJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_BODY_BYTES) {
      throw new Error("Request body is too large.");
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) {
    return {};
  }
  return JSON.parse(text);
}


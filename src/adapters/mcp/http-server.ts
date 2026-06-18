import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMahjongMcpServer } from "./server.ts";
import { ENGINE_VERSION } from "../../service/responses.ts";

export async function handleMcpHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "GET" && url.pathname === "/health") {
    writeJson(res, 200, {
      ok: true,
      service: "mahjong-ai-mcp-http",
      engineVersion: ENGINE_VERSION,
    });
    return;
  }

  if (url.pathname !== "/mcp") {
    writeJson(res, 404, {
      jsonrpc: "2.0",
      error: {
        code: -32004,
        message: "Not found.",
      },
      id: null,
    });
    return;
  }

  if (req.method !== "POST" && req.method !== "GET" && req.method !== "DELETE") {
    writeJson(res, 405, {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    });
    return;
  }

  const server = createMahjongMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
  } catch (error) {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    if (!res.headersSent) {
      writeJson(res, 500, {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal server error.",
        },
        id: null,
      });
    } else {
      res.end();
    }
  }
}

export function createMcpHttpServer() {
  return createServer((req, res) => {
    void handleMcpHttpRequest(req, res);
  });
}

function writeJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function main(): void {
  const host = getArgValue("--host") ?? "127.0.0.1";
  const port = Number(getArgValue("--port") ?? "3334");
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid --port value: ${port}`);
  }

  const server = createMcpHttpServer();
  server.listen(port, host, () => {
    console.log(`Mahjong AI MCP HTTP server listening on http://${host}:${port}/mcp`);
  });
}

function getArgValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

if (process.argv[1]?.endsWith("http-server.ts")) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}


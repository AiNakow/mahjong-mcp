import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ENGINE_VERSION } from "../../service/responses.ts";
import { registerMahjongMcpTools } from "./tools.ts";

export function createMahjongMcpServer(): Server {
  const server = new Server(
    {
      name: "mahjong-ai",
      version: ENGINE_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: "Use these tools for deterministic riichi mahjong hand analysis, scoring, and action recommendations.",
    },
  );
  registerMahjongMcpTools(server);
  return server;
}

async function main(): Promise<void> {
  const server = createMahjongMcpServer();
  await server.connect(new StdioServerTransport());
}

if (process.argv[1]?.endsWith("server.ts")) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}


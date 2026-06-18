import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMcpHttpServer } from "../src/adapters/mcp/http-server.ts";
import { callMahjongMcpTool, mahjongMcpTools } from "../src/adapters/mcp/tools.ts";
import { schemas } from "../src/schemas/registry.ts";

type TextContent = {
  type: "text";
  text: string;
};

test("MCP tools expose expected tool list and JSON schemas", () => {
  const names = mahjongMcpTools.map((tool) => tool.name);
  assert.ok(names.includes("mahjong_nanikiru"));
  assert.ok(names.includes("mahjong_choose_action"));
  const nanikiru = mahjongMcpTools.find((tool) => tool.name === "mahjong_nanikiru");
  const choose = mahjongMcpTools.find((tool) => tool.name === "mahjong_choose_action");
  assert.equal(nanikiru?.inputSchema, schemas.nanikiruToolRequest);
  assert.equal(choose?.inputSchema, schemas.chooseActionToolRequest);
  assert.equal(choose?.outputSchema, schemas.toolOutputServiceResult);
});

test("MCP tool handler returns JSON ServiceResult content", () => {
  const result = callMahjongMcpTool("mahjong_nanikiru", { text: "3456m3455p123788s", options: { useEvDecision: false } });
  assert.equal(result.isError, false);
  assert.equal((result.structuredContent as { ok?: boolean }).ok, true);
  const jsonBlock = result.content.find((item) => item.type === "text" && "text" in item && item.text.trim().startsWith("{"));
  assert.ok(jsonBlock);
  assert.equal(jsonBlock.type, "text");
  assert.ok("text" in jsonBlock);
  const parsed = JSON.parse(jsonBlock.text) as { ok: boolean; meta?: { source: string } };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.meta?.source, "mcp");
});

test("MCP tool handler reports unknown tools as errors", () => {
  const result = callMahjongMcpTool("mahjong_unknown", {});
  assert.equal(result.isError, true);
});

test("MCP stdio server lists and calls mahjong tools", async () => {
  const client = new Client({
    name: "mahjong-ai-adapter-test",
    version: "0.1.0",
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["src/adapters/mcp/server.ts"],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "mahjong_nanikiru"));

    const result = await client.callTool({
      name: "mahjong_nanikiru",
      arguments: {
        text: "3456m3455p123788s",
        options: {
          useEvDecision: false,
        },
      },
    });
    assert.equal("content" in result, true);
    if ("content" in result) {
      const content = result.content as TextContent[];
      const jsonBlock = content.find((item) => item.type === "text" && item.text.trim().startsWith("{"));
      assert.ok(jsonBlock);
      assert.equal(jsonBlock.type, "text");
      const parsed = JSON.parse(jsonBlock.text) as { ok: boolean; meta?: { source: string } };
      assert.equal(parsed.ok, true);
      assert.equal(parsed.meta?.source, "mcp");
    }
  } finally {
    await client.close();
  }
});

test("MCP Streamable HTTP server lists and calls mahjong tools", async () => {
  const httpServer = createMcpHttpServer();
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  assert.notEqual(address, null);
  assert.notEqual(typeof address, "string");
  const serverAddress = address as AddressInfo;
  const client = new Client({
    name: "mahjong-ai-http-mcp-test",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${serverAddress.port}/mcp`));
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "mahjong_nanikiru"));

    const result = await client.callTool({
      name: "mahjong_nanikiru",
      arguments: {
        text: "3456m3455p123788s",
        options: {
          useEvDecision: false,
        },
      },
    });
    assert.equal("content" in result, true);
    if ("content" in result) {
      const content = result.content as TextContent[];
      const jsonBlock = content.find((item) => item.type === "text" && item.text.trim().startsWith("{"));
      assert.ok(jsonBlock);
      const parsed = JSON.parse(jsonBlock.text) as { ok: boolean; meta?: { source: string } };
      assert.equal(parsed.ok, true);
      assert.equal(parsed.meta?.source, "mcp");
    }
  } finally {
    await client.close().catch(() => undefined);
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => error ? reject(error) : resolve());
    });
  }
});

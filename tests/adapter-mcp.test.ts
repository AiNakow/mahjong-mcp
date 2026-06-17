import assert from "node:assert/strict";
import test from "node:test";
import { callMahjongMcpTool, mahjongMcpTools } from "../src/adapters/mcp/tools.ts";
import { schemas } from "../src/schemas/registry.ts";

test("MCP tools expose expected tool list and JSON schemas", () => {
  const names = mahjongMcpTools.map((tool) => tool.name);
  assert.ok(names.includes("mahjong_nanikiru"));
  assert.ok(names.includes("mahjong_choose_action"));
  const choose = mahjongMcpTools.find((tool) => tool.name === "mahjong_choose_action");
  assert.equal(choose?.inputSchema, schemas.chooseActionRequest);
});

test("MCP tool handler returns JSON ServiceResult content", () => {
  const result = callMahjongMcpTool("mahjong_nanikiru", { text: "3456m3455p123788s", options: { useEvDecision: false } });
  assert.equal(result.isError, false);
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

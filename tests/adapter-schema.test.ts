import assert from "node:assert/strict";
import test from "node:test";
import { anthropicTools } from "../src/adapters/tools/anthropic.ts";
import { executeOpenAITool, openAITools } from "../src/adapters/tools/openai.ts";
import { schemas, validateSchema } from "../src/schemas/registry.ts";

test("schema registry exposes public request schemas", () => {
  assert.equal(schemas.chooseActionRequest.type, "object");
  assert.equal(schemas.nanikiruRequest.type, "object");
  assert.equal(schemas.scoreHandRequest.type, "object");
});

test("schema validator accepts valid nanikiru request and rejects empty text", () => {
  assert.deepEqual(validateSchema("nanikiruRequest", { text: "3456m3455p123788s" }), { valid: true });
  const invalid = validateSchema("nanikiruRequest", { text: "" });
  assert.equal(invalid.valid, false);
});

test("candidate action schema validates each action branch", () => {
  assert.deepEqual(validateSchema("candidateAction", { type: "discard", tile: "5p" }), { valid: true });
  assert.deepEqual(validateSchema("candidateAction", {
    type: "call-discard",
    callType: "pon",
    calledTile: "5z",
    tile: "8m",
  }), { valid: true });
  const invalid = validateSchema("candidateAction", { type: "discard" });
  assert.equal(invalid.valid, false);
});

test("OpenAI and Anthropic tool exports reuse same schemas", () => {
  const openAIChoose = openAITools.find((tool) => tool.function.name === "mahjong_choose_action");
  const anthropicChoose = anthropicTools.find((tool) => tool.name === "mahjong_choose_action");
  assert.equal(openAIChoose?.function.parameters, schemas.chooseActionRequest);
  assert.equal(anthropicChoose?.input_schema, schemas.chooseActionRequest);
});

test("tool executor returns service result with platform source", () => {
  const result = executeOpenAITool("mahjong_nanikiru", { text: "3456m3455p123788s" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.meta.source, "openai_tool");
  }
});

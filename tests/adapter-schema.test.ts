import assert from "node:assert/strict";
import test from "node:test";
import { anthropicTools } from "../src/adapters/tools/anthropic.ts";
import { executeOpenAITool, openAITools } from "../src/adapters/tools/openai.ts";
import { schemas, validateSchema } from "../src/schemas/registry.ts";

test("schema registry exposes public request schemas", () => {
  assert.equal(schemas.chooseActionRequest.type, "object");
  assert.equal(schemas.chooseActionToolRequest.type, "object");
  assert.equal(schemas.nanikiruRequest.type, "object");
  assert.equal(schemas.nanikiruToolRequest.type, "object");
  assert.equal(schemas.scoreHandRequest.type, "object");
});

test("schema validator accepts valid nanikiru request and rejects empty text", () => {
  assert.deepEqual(validateSchema("nanikiruRequest", { text: "3456m3455p123788s" }), { valid: true });
  const invalid = validateSchema("nanikiruRequest", { text: "" });
  assert.equal(invalid.valid, false);
});

test("public policy schema exposes explicit override fields", () => {
  assert.deepEqual(validateSchema("nanikiruPolicy", {
    ukeireWeight: 1,
    goodShapeWeight: 100,
    useScoringForTenpaiValue: false,
  }), { valid: true });
  const invalid = validateSchema("nanikiruPolicy", { arbitraryPolicyKnob: 1 });
  assert.equal(invalid.valid, false);
});

test("tool request schemas hide advanced policy overrides", () => {
  assert.deepEqual(validateSchema("nanikiruRequest", {
    text: "3456m3455p123788s",
    policy: { ukeireWeight: 1 },
  }), { valid: true });
  const toolRequest = validateSchema("nanikiruToolRequest", {
    text: "3456m3455p123788s",
    policy: { ukeireWeight: 1 },
  });
  assert.equal(toolRequest.valid, false);
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

test("response-side schemas validate core public shapes", () => {
  assert.deepEqual(validateSchema("decisionAction", { type: "discard", tile: "5p" }), { valid: true });
  assert.deepEqual(validateSchema("reason", {
    type: "ukeire",
    polarity: "positive",
    priority: 90,
    message: "进张较多。",
  }), { valid: true });
  const invalidDecision = validateSchema("decisionAction", { type: "chi", tiles: ["3m", "4m", "5m"] });
  assert.equal(invalidDecision.valid, false);
});

test("OpenAI and Anthropic tool exports reuse same schemas", () => {
  const openAIChoose = openAITools.find((tool) => tool.function.name === "mahjong_choose_action");
  const anthropicChoose = anthropicTools.find((tool) => tool.name === "mahjong_choose_action");
  assert.equal(openAIChoose?.function.parameters, schemas.chooseActionToolRequest);
  assert.equal(anthropicChoose?.input_schema, schemas.chooseActionToolRequest);
});

test("tool executor returns service result with platform source", () => {
  const result = executeOpenAITool("mahjong_nanikiru", { text: "3456m3455p123788s" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.meta.source, "openai_tool");
  }
});

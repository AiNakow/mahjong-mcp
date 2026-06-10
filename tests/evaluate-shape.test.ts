import assert from "node:assert/strict";
import test from "node:test";

import type { DiscardCandidate } from "../src/service/analyze.ts";
import { evaluateShape, extractShapeFeatures } from "../src/strategy/evaluators/evaluate-shape.ts";

test("extractShapeFeatures detects ryanmen, kanchan, penchan and complex shapes", () => {
  const features = extractShapeFeatures([
    "2m", "3m", "3m", "4m",
    "1p", "2p",
    "4s", "6s",
    "1z",
  ]);

  assert.equal(features.ryanmen, 2);
  assert.equal(features.kanchan, 2);
  assert.equal(features.penchan, 1);
  assert.equal(features.complex, 1);
  assert.equal(features.isolatedTerminalOrHonor, 1);
});

test("evaluateShape emits shape reasons and score", () => {
  const candidate: DiscardCandidate = {
    discard: "9s",
    shanten: 1,
    waits: [
      { id: "1m", remaining: 4 },
      { id: "2m", remaining: 4 },
      { id: "3m", remaining: 4 },
      { id: "4m", remaining: 4 },
      { id: "5m", remaining: 4 },
      { id: "6m", remaining: 4 },
      { id: "7m", remaining: 4 },
      { id: "8m", remaining: 4 },
      { id: "9m", remaining: 4 },
      { id: "1p", remaining: 4 },
    ],
    totalWaits: 40,
    goodShapeCount: 20,
    goodShapeDraws: ["2m"],
  };

  const result = evaluateShape([
    "2m", "3m", "3m", "4m",
    "4p", "5p",
    "1z",
    "9s",
  ], candidate);

  assert.ok(result.score > 0);
  assert.ok(result.reasons.some((reason) => reason.message.includes("两面搭子")));
  assert.ok(result.reasons.some((reason) => reason.message.includes("复合形")));
  assert.ok(result.reasons.some((reason) => reason.message.includes("孤立幺九字牌")));
});

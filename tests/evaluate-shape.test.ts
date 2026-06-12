import assert from "node:assert/strict";
import test from "node:test";

import { tilesToCounts34 } from "../src/core/counts.ts";
import type { TileId } from "../src/core/tile.ts";
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
  assert.ok(result.reasons.some((reason) => reason.message.includes("两面延展")));
  assert.ok(result.reasons.some((reason) => reason.message.includes("复合形")));
  assert.ok(result.reasons.some((reason) => reason.message.includes("孤立幺九字牌")));
});

test("block efficiency uses actual remaining tiles for weak taatsu value", () => {
  const afterDiscard: TileId[] = [
    "3p", "5p", "8p", "9p", "9p",
    "4s", "7s", "7s", "8s", "8s", "8s",
    "1z", "1z",
  ];
  const candidate: DiscardCandidate = {
    discard: "2s",
    shanten: 2,
    waits: [{ id: "3s", remaining: 4 }],
    totalWaits: 26,
    goodShapeCount: 0,
    goodShapeDraws: [],
  };

  const normal = evaluateShape(afterDiscard, candidate, {
    visibleTiles: tilesToCounts34([...afterDiscard, "2s"]),
  });
  const thinMiddle = evaluateShape(afterDiscard, candidate, {
    visibleTiles: tilesToCounts34([...afterDiscard, "2s", "3s", "3s", "3s"]),
  });

  assert.ok(getBlockEfficiency(thinMiddle) > getBlockEfficiency(normal));
});

function getBlockEfficiency(result: ReturnType<typeof evaluateShape>): number {
  const reason = result.reasons.find((item) => item.type === "shape" && typeof item.data?.blockEfficiency === "number");
  assert.ok(reason);
  assert.ok(reason.data);
  return reason.data.blockEfficiency as number;
}

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

test("block efficiency recognizes gap pair, sequence run and triplet side blocks", () => {
  assert.deepEqual(
    getBestCompressedBlock([
      "7p", "9p", "9p",
      "4s",
      "1z", "1z", "2z", "2z", "3z", "3z", "4z", "4z",
      "5m",
    ], "2s"),
    ["9p", "9p", "7p"],
  );
  assert.deepEqual(
    getBestCompressedBlock([
      "4p", "5p", "6p", "7p",
      "4s",
      "1z", "1z", "2z", "2z", "3z", "3z", "4z", "4z",
    ], "2s"),
    ["4p", "5p", "6p", "7p"],
  );
  assert.deepEqual(
    getBestCompressedBlock([
      "3p", "5p", "5p", "5p",
      "4s",
      "1z", "1z", "2z", "2z", "3z", "3z", "4z", "4z",
    ], "2s"),
    ["5p", "5p", "5p", "3p"],
  );
  assert.deepEqual(
    getBestCompressedBlock([
      "6p", "6p", "6p", "7p",
      "4s",
      "1z", "1z", "2z", "2z", "3z", "3z", "4z", "4z",
    ], "2s"),
    ["6p", "6p", "6p", "7p"],
  );
});

test("block efficiency does not trigger outside overblock hands", () => {
  const result = evaluateShape([
    "7p", "9p", "9p",
    "4s",
    "1m", "5m", "9m",
    "1z", "2z", "3z", "4z", "5z", "6z",
  ], makeCandidate("2s"), {
    visibleTiles: tilesToCounts34([
      "7p", "9p", "9p",
      "2s", "4s",
      "1m", "5m", "9m",
      "1z", "2z", "3z", "4z", "5z", "6z",
    ]),
  });

  assert.equal(hasBlockEfficiency(result), false);
});

test("block efficiency does not prefer a dead compressed block over a live weak taatsu", () => {
  const afterDiscard: TileId[] = [
    "7p", "9p", "9p",
    "4s",
    "1z", "1z", "2z", "2z", "3z", "3z", "4z", "4z",
    "5m",
  ];
  const result = evaluateShape(afterDiscard, makeCandidate("2s"), {
    visibleTiles: tilesToCounts34([
      ...afterDiscard,
      "2s",
      "7p", "7p", "7p",
      "8p", "8p", "8p", "8p",
      "9p", "9p",
    ]),
  });

  assert.equal(hasBlockEfficiency(result), false);
});

test("block efficiency penalty stays below a clear ukeire edge", () => {
  const result = evaluateShape([
    "7p",
    "9p",
    "2s", "4s",
    "1z", "1z", "2z", "2z", "3z", "3z", "4z", "4z",
    "5m",
  ], makeCandidate("9p"), {
    visibleTiles: tilesToCounts34([
      "7p",
      "9p", "9p",
      "2s", "4s",
      "1z", "1z", "2z", "2z", "3z", "3z", "4z", "4z",
      "5m",
    ]),
  });

  assert.ok(Math.abs(getBlockEfficiency(result)) < 50);
});

test("overloaded taatsu prefers keeping 79 over pure 12 edge", () => {
  const afterBreaking12: TileId[] = [
    "2m",
    "7p", "9p",
    "3s", "5s",
    "4p", "6p",
    "1z", "1z", "2z", "2z", "3z", "3z",
  ];
  const afterBreaking79: TileId[] = [
    "1m", "2m",
    "9p",
    "3s", "5s",
    "4p", "6p",
    "1z", "1z", "2z", "2z", "3z", "3z",
  ];

  const break12 = evaluateShape(afterBreaking12, makeCandidate("1m"), {
    visibleTiles: tilesToCounts34([...afterBreaking12, "1m"]),
  });
  const break79 = evaluateShape(afterBreaking79, makeCandidate("7p"), {
    visibleTiles: tilesToCounts34([...afterBreaking79, "7p"]),
  });

  assert.ok(getBlockEfficiency(break12) > 0);
  assert.ok(getBlockEfficiency(break79) < 0);
});

test("callability values terminal pairs when an open yaku route is available", () => {
  const afterDiscard: TileId[] = [
    "1m", "1m",
    "5z", "5z",
    "2p", "4p",
    "3s", "5s",
    "1z", "1z", "2z", "2z", "3z",
  ];
  const result = evaluateShape(afterDiscard, {
    ...makeCandidate("9s"),
    shanten: 1,
  }, {
    visibleTiles: tilesToCounts34([...afterDiscard, "9s"]),
  });
  const reason = result.reasons.find((item) => item.type === "shape" && typeof item.data?.callability === "number");

  assert.ok(reason);
  assert.equal(reason.data?.bestCallKind, "pon");
  assert.ok((reason.data?.callability as number) > 0);
  assert.equal(reason.data?.yakuCertainty, 1);
});

function getBlockEfficiency(result: ReturnType<typeof evaluateShape>): number {
  const reason = result.reasons.find((item) => item.type === "shape" && typeof item.data?.blockEfficiency === "number");
  assert.ok(reason);
  assert.ok(reason.data);
  return reason.data.blockEfficiency as number;
}

function hasBlockEfficiency(result: ReturnType<typeof evaluateShape>): boolean {
  return result.reasons.some((item) => item.type === "shape" && typeof item.data?.blockEfficiency === "number");
}

function getBestCompressedBlock(afterDiscard: TileId[], discard: TileId): TileId[] {
  const result = evaluateShape(afterDiscard, makeCandidate(discard), {
    visibleTiles: tilesToCounts34([...afterDiscard, discard]),
  });
  const reason = result.reasons.find((item) => item.type === "shape" && item.polarity === "positive" && item.data?.compressedBlock);
  assert.ok(reason);
  assert.ok(Array.isArray(reason.data?.compressedBlock));
  return reason.data.compressedBlock as TileId[];
}

function makeCandidate(discard: TileId): DiscardCandidate {
  return {
    discard,
    shanten: 2,
    waits: [{ id: "3s", remaining: 4 }],
    totalWaits: 26,
    goodShapeCount: 0,
    goodShapeDraws: [],
  };
}

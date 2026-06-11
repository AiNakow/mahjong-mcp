import assert from "node:assert/strict";
import test from "node:test";

import { analyzeHandText } from "../src/service/analyze.ts";
import { HandTextParseError, parseHandText } from "../src/service/parse-hand.ts";

test("parseHandText extracts compact hand from labeled input", () => {
  assert.equal(parseHandText("手牌: 123m 456p 789s 1z"), "123m456p789s1z");
});

test("analyzeHandText returns draw analysis for 3n+1 hands", () => {
  const result = analyzeHandText("123m456p789s1z");

  assert.equal(result.kind, "draw");
  assert.equal(result.tileCount, 10);
  assert.equal(result.shanten, 0);
  assert.equal(result.isTenpai, true);

  if (result.kind === "draw") {
    assert.deepEqual(result.draws, [{ id: "1z", remaining: 3 }]);
    assert.equal(result.totalDraws, 3);
  }
});

test("analyzeHandText subtracts unavailable tiles from draw remaining counts", () => {
  const result = analyzeHandText({
    text: "23m456p789s11z",
    unavailableTiles: ["1m", "1m"],
  });

  assert.equal(result.kind, "draw");
  if (result.kind !== "draw") {
    throw new Error("expected draw analysis");
  }

  assert.equal(result.draws.find((draw) => draw.id === "1m")?.remaining, 2);
  assert.equal(result.draws.find((draw) => draw.id === "4m")?.remaining, 4);
  assert.equal(result.totalDraws, 6);
});

test("analyzeHandText still returns discard analysis for 3n+2 hands", () => {
  const result = analyzeHandText("3456m3455p123788s");

  assert.equal(result.kind, "discard");
  assert.equal(result.recommendation, "7s");
  assert.equal(result.candidates[0].totalWaits, 50);
  assert.equal(result.candidates.length, 12);
  assert.ok(result.candidates.some((candidate) => candidate.discard === "1s" && candidate.shanten === 2));
});

test("analyzeHandText rejects invalid text", () => {
  assert.throws(
    () => analyzeHandText("没有手牌"),
    HandTextParseError,
  );
});

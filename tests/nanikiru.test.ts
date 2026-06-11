import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeNanikiru,
  NanikiruParseError,
  parseNanikiruHandText,
} from "../src/service/nanikiru.ts";

test("parseNanikiruHandText accepts a compact hand string", () => {
  assert.equal(parseNanikiruHandText("3456m3455p123788s"), "3456m3455p123788s");
});

test("parseNanikiruHandText extracts hand from labeled Chinese text", () => {
  assert.equal(
    parseNanikiruHandText("手牌: 3456m 3455p 123788s"),
    "3456m3455p123788s",
  );
});

test("analyzeNanikiru returns compact recommendation structure by default", () => {
  const result = analyzeNanikiru("3456m3455p123788s");
  const recommended = result.recommendedCandidate;

  assert.equal(result.input, "3456m3455p123788s");
  assert.equal(result.handText, "3456m3455p123788s");
  assert.equal(result.tileCount, 14);
  assert.equal(result.shanten, 1);
  assert.equal(result.recommendation, "7s");
  assert.equal(result.candidates, undefined);
  assert.ok(recommended);
  assert.equal(recommended.discard, "7s");
  assert.equal(recommended.totalWaits, 50);
  assert.equal(recommended.scoreBreakdown.ukeire, 500);
  assert.equal(
    recommended.score,
    Object.values(recommended.scoreBreakdown).reduce((total, value) => total + value, 0),
  );
  assert.ok(recommended.reasons.some((reason) => reason.type === "ukeire"));
  assert.match(result.explanation, /推荐：切 7s。/);
  assert.deepEqual(recommended.goodShapeDraws, [
    "2m", "4m", "5m", "7m", "4p", "5p", "6p", "8s",
  ]);
});

test("analyzeNanikiru can include all candidates in verbose mode", () => {
  const result = analyzeNanikiru({
    text: "3456m3455p123788s",
    verbose: true,
  });

  assert.equal(result.candidates?.length, 12);
  assert.equal(result.candidates?.[0].discard, "7s");
  assert.ok(result.raw);
});

test("analyzeNanikiru accepts object input with mode", () => {
  const result = analyzeNanikiru({
    text: "手牌：11223344556677m",
    mode: 0,
  });

  assert.equal(result.isTenpai, true);
  assert.equal(result.isAgari, true);
  assert.equal(result.recommendation, "2m");
});

test("analyzeNanikiru accepts policy overrides", () => {
  const result = analyzeNanikiru({
    text: "3456m3455p123788s",
    policy: {
      ukeireWeight: 1,
      goodShapeWeight: 100,
    },
  });

  assert.equal(result.recommendation, "1s");
  assert.equal(result.recommendedCandidate?.shanten, 2);
  assert.equal(result.recommendedCandidate?.goodShapeCount, 72);
});

test("analyzeNanikiru accepts calls and scoring context", () => {
  const result = analyzeNanikiru({
    text: "234m456p778s22z",
    calls: [{ type: "pon", tiles: ["5z", "5z", "5z"], calledTile: "5z" }],
    seatWind: "2z",
    bakaze: "1z",
    doraIndicators: ["1m"],
    verbose: true,
  });

  assert.deepEqual(result.calls, [{ type: "pon", tiles: ["5z", "5z", "5z"], calledTile: "5z" }]);
  assert.equal(result.context.seatWind, "2z");
  assert.equal(result.context.bakaze, "1z");
  assert.deepEqual(result.context.doraIndicators, ["1m"]);
  assert.equal(result.tileCount, 11);
  assert.ok(result.recommendedCandidate);
});

test("analyzeNanikiru derives aka dora count from red five notation", () => {
  const result = analyzeNanikiru({
    text: "230m456p778s22z",
    calls: [{ type: "pon", tiles: ["5z", "5z", "5z"], calledTile: "5z" }],
    verbose: true,
  });

  assert.equal(result.context.akaDoraCount, 1);
  assert.equal(result.hand.includes("5m"), true);
});

test("analyzeNanikiru rejects invalid input", () => {
  assert.throws(
    () => analyzeNanikiru("这不是手牌"),
    NanikiruParseError,
  );
});

test("analyzeNanikiru rejects 3n+1 hands because no discard is needed", () => {
  assert.throws(
    () => analyzeNanikiru("123m456p789s1z"),
    NanikiruParseError,
  );
});

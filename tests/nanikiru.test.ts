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

test("analyzeNanikiru returns normalized candidate structure", () => {
  const result = analyzeNanikiru("3456m3455p123788s");

  assert.equal(result.input, "3456m3455p123788s");
  assert.equal(result.handText, "3456m3455p123788s");
  assert.equal(result.tileCount, 14);
  assert.equal(result.shanten, 1);
  assert.equal(result.recommendation, "7s");
  assert.equal(result.candidates.length, 12);
  assert.equal(result.candidates[0].discard, "7s");
  assert.equal(result.candidates[0].totalWaits, 50);
  assert.equal(result.candidates[0].scoreBreakdown.ukeire, 500);
  assert.equal(
    result.candidates[0].score,
    Object.values(result.candidates[0].scoreBreakdown).reduce((total, value) => total + value, 0),
  );
  assert.ok(result.candidates[0].reasons.some((reason) => reason.type === "ukeire"));
  assert.match(result.explanation, /推荐：切 7s。/);
  assert.deepEqual(result.candidates[0].goodShapeDraws, [
    "2m", "4m", "5m", "7m", "4p", "5p", "6p", "8s",
  ]);
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
  assert.equal(result.candidates[0].shanten, 2);
  assert.equal(result.candidates[0].goodShapeCount, 72);
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

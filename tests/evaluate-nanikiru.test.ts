import assert from "node:assert/strict";
import test from "node:test";

import { renderNanikiruExplanation } from "../src/explanation/render-nanikiru.ts";
import { analyzeHandText } from "../src/service/analyze.ts";
import { evaluateNanikiru } from "../src/strategy/evaluate-nanikiru.ts";
import { DEFAULT_NANIKIRU_POLICY } from "../src/strategy/nanikiru-policy.ts";

test("evaluateNanikiru adds score breakdown and reasons", () => {
  const analysis = analyzeHandText("3456m3455p123788s");
  assert.equal(analysis.kind, "discard");

  if (analysis.kind !== "discard") {
    throw new Error("expected discard analysis");
  }

  const evaluated = evaluateNanikiru(analysis);
  const best = evaluated.candidates[0];

  assert.equal(evaluated.recommendation, "7s");
  assert.equal(evaluated.candidates.length, 12);
  assert.equal(best.discard, "7s");
  assert.equal(best.totalWaits, 50);
  assert.equal(best.scoreBreakdown.ukeire, 500);
  assert.equal(best.scoreBreakdown.goodShape, 200);
  assert.equal(
    best.score,
    Object.values(best.scoreBreakdown).reduce((total, value) => total + value, 0),
  );
  assert.ok(best.reasons.some((reason) => reason.type === "ukeire"));
  assert.ok(best.reasons.some((reason) => reason.type === "good_shape"));
  assert.ok(evaluated.candidates.some((candidate) => (
    candidate.discard === "1s"
    && candidate.shanten === 2
    && candidate.scoreBreakdown.shanten === -2000
  )));
});

test("evaluateNanikiru keeps shanten-back candidates behind non-back candidates", () => {
  const analysis = analyzeHandText("3456m3455p123788s");
  assert.equal(analysis.kind, "discard");

  if (analysis.kind !== "discard") {
    throw new Error("expected discard analysis");
  }

  const evaluated = evaluateNanikiru(analysis, {
    ...DEFAULT_NANIKIRU_POLICY,
    ukeireWeight: 1,
    goodShapeWeight: 100,
    useScoringForTenpaiValue: false,
  });
  const shantenBack = evaluated.candidates.find((candidate) => candidate.discard === "1s");

  assert.equal(evaluated.recommendation, "5p");
  assert.equal(evaluated.candidates[0].shanten, 1);
  assert.ok(shantenBack);
  assert.equal(shantenBack.shanten, 2);
  assert.equal(shantenBack.goodShapeCount, 72);
  assert.equal(shantenBack.scoreBreakdown.ukeire, 72 * 1 * DEFAULT_NANIKIRU_POLICY.shantenBackUkeireMultiplier);
  assert.equal(shantenBack.scoreBreakdown.goodShape, 72 * 100 * DEFAULT_NANIKIRU_POLICY.shantenBackGoodShapeMultiplier);
});

test("evaluateNanikiru can prefer breaking yakuhai pair for strong tanyao route", () => {
  const analysis = analyzeHandText("34678m34p77755s66z");
  assert.equal(analysis.kind, "discard");

  if (analysis.kind !== "discard") {
    throw new Error("expected discard analysis");
  }

  const evaluated = evaluateNanikiru(analysis);
  const best = evaluated.candidates[0];

  assert.equal(evaluated.recommendation, "6z");
  assert.equal(best.discard, "6z");
  assert.ok(best.reasons.some((reason) => (
    reason.type === "value"
    && String(reason.message).includes("拆役牌对子")
  )));

  const explanation = renderNanikiruExplanation(evaluated);
  assert.match(explanation, /拆役牌对子/);
});

test("evaluateNanikiru keeps clear tanyao route over small raw ukeire edge", () => {
  const analysis = analyzeHandText({
    text: "234677m2334p6789s",
    unavailableTiles: ["2z"],
  });
  assert.equal(analysis.kind, "discard");

  if (analysis.kind !== "discard") {
    throw new Error("expected discard analysis");
  }

  const evaluated = evaluateNanikiru(analysis, DEFAULT_NANIKIRU_POLICY, {
    bakaze: "1z",
    seatWind: "1z",
    doraIndicators: ["2z"],
  });
  const best = evaluated.candidates[0];
  const threePin = evaluated.candidates.find((candidate) => candidate.discard === "3p");

  assert.equal(evaluated.recommendation, "9s");
  assert.equal(best.discard, "9s");
  assert.ok(best.scoreBreakdown.route > 0);
  assert.ok(threePin);
  assert.ok(threePin.scoreBreakdown.route < 0);
  assert.ok(best.reasons.some((reason) => (
    reason.type === "route"
    && String(reason.message).includes("断幺路线")
  )));
});

test("evaluateNanikiru uses scoring route for tenpai candidates", () => {
  const analysis = analyzeHandText("234m234p234s55m667p");
  assert.equal(analysis.kind, "discard");

  if (analysis.kind !== "discard") {
    throw new Error("expected discard analysis");
  }

  const evaluated = evaluateNanikiru(analysis);
  const candidate = evaluated.candidates.find((item) => item.discard === "6p");

  assert.ok(candidate);
  assert.equal(candidate.shanten, 0);
  assert.ok(candidate.scoreBreakdown.value > 90);
  assert.ok(candidate.reasons.some((reason) => (
    reason.type === "value"
    && String(reason.message).includes("最高和牌点数")
  )));
});

test("evaluateNanikiru explains value route difference against the runner-up", () => {
  const analysis = analyzeHandText("2345m23456789s23p");
  assert.equal(analysis.kind, "discard");

  if (analysis.kind !== "discard") {
    throw new Error("expected discard analysis");
  }

  const evaluated = evaluateNanikiru(analysis);
  const best = evaluated.candidates[0];
  const second = evaluated.candidates[1];

  assert.equal(best.discard, "5m");
  assert.equal(second.discard, "2m");
  assert.ok(best.reasons.some((reason) => (
    reason.type === "value"
    && String(reason.message).includes("三色同顺")
    && reason.data?.secondDiscard === "2m"
  )));

  const explanation = renderNanikiruExplanation(evaluated);
  assert.match(explanation, /兼顾三色同顺/);
  assert.doesNotMatch(explanation, /9 组两面搭子/);
});

test("evaluateNanikiru prefers the safer outer discard when efficiency is tied", () => {
  const analysis = analyzeHandText("33555m2334p22s67s1p");
  assert.equal(analysis.kind, "discard");

  if (analysis.kind !== "discard") {
    throw new Error("expected discard analysis");
  }

  const evaluated = evaluateNanikiru(analysis, DEFAULT_NANIKIRU_POLICY, {
    doraIndicators: ["6s"],
    turn: 7,
    bakaze: "1z",
    seatWind: "1z",
  });
  const best = evaluated.candidates[0];
  const explanation = renderNanikiruExplanation(evaluated);

  assert.equal(best.discard, "2s");
  assert.equal(evaluated.candidates[1]?.discard, "3m");
  assert.ok(!best.reasons.some((reason) => (
    reason.type === "defenseComparison"
    && String(reason.message).includes("避免听牌时再切相对更危险的牌")
  )));
  assert.doesNotMatch(explanation, /避免听牌时再切相对更危险的牌/);
  assert.ok(best.reasons.some((reason) => (
    reason.type === "defenseComparison"
    && String(reason.message).includes("当前和转听牌时的中张压力更低")
  )));
  assert.match(explanation, /当前和转听牌时的中张压力更低/);
});

test("renderNanikiruExplanation renders high-priority reasons", () => {
  const analysis = analyzeHandText("3456m3455p123788s");
  assert.equal(analysis.kind, "discard");

  if (analysis.kind !== "discard") {
    throw new Error("expected discard analysis");
  }

  const explanation = renderNanikiruExplanation(evaluateNanikiru(analysis));

  assert.match(explanation, /推荐：切 7s。/);
  assert.match(explanation, /总进张 50 枚/);
  assert.match(explanation, /好形相关进张 25 枚/);
});

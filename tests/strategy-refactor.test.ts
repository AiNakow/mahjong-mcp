import assert from "node:assert/strict";
import test from "node:test";

import { analyzeHandText } from "../src/service/analyze.ts";
import { buildCandidateFeature } from "../src/strategy/features.ts";
import { evaluateRoutePortfolio } from "../src/strategy/routes.ts";
import {
  DEFAULT_NANIKIRU_POLICY,
  normalizeStrategyPolicy,
} from "../src/strategy/nanikiru-policy.ts";
import { evaluateNanikiru } from "../src/strategy/evaluate-nanikiru.ts";

test("buildCandidateFeature centralizes shape and value facts", () => {
  const analysis = analyzeHandText("23677m34p1235796s");
  assert.equal(analysis.kind, "discard");

  if (analysis.kind !== "discard") {
    throw new Error("expected discard analysis");
  }

  const candidate = analysis.candidates.find((item) => item.discard === "9s");
  assert.ok(candidate);

  const afterDiscard = [...analysis.hand];
  afterDiscard.splice(afterDiscard.indexOf("9s"), 1);
  const feature = buildCandidateFeature(analysis.hand, afterDiscard, candidate, {
    doraIndicators: ["1m"],
  });

  assert.equal(feature.discard, "9s");
  assert.equal(feature.shanten, 1);
  assert.equal(feature.totalWaits, candidate.totalWaits);
  assert.equal(feature.goodShapeRatio, 1);
  assert.equal(feature.tiles.doraCount, 1);
  assert.equal(feature.tiles.doraTiles[0], "2m");
  assert.ok(feature.blocks.ryanmenCount >= 1);
});

test("evaluateRoutePortfolio exposes chanta sanshoku composite line", () => {
  const analysis = analyzeHandText("11233m11223p22z12s");
  assert.equal(analysis.kind, "discard");

  if (analysis.kind !== "discard") {
    throw new Error("expected discard analysis");
  }

  const candidate = analysis.candidates.find((item) => item.discard === "2p");
  assert.ok(candidate);

  const afterDiscard = [...analysis.hand];
  afterDiscard.splice(afterDiscard.indexOf("2p"), 1);
  const feature = buildCandidateFeature(analysis.hand, afterDiscard, candidate, {
    bakaze: "1z",
    seatWind: "3z",
  });
  const portfolio = evaluateRoutePortfolio(feature, DEFAULT_NANIKIRU_POLICY, {
    bakaze: "1z",
    seatWind: "3z",
  });

  const composite = portfolio.routes.find((route) => route.id === "chanta_sanshoku");
  assert.ok(composite);
  assert.equal(composite.data?.primaryRoute, undefined);
  assert.ok(composite.value > DEFAULT_NANIKIRU_POLICY.chiitoiBonus);
  assert.deepEqual(portfolio.bestLine?.ids, ["chanta_sanshoku"]);
});

test("same-shanten improvement is scored outside static value routes", () => {
  const analysis = analyzeHandText("11233m11223p22z12s");
  assert.equal(analysis.kind, "discard");

  if (analysis.kind !== "discard") {
    throw new Error("expected discard analysis");
  }

  const evaluated = evaluateNanikiru(analysis, DEFAULT_NANIKIRU_POLICY, {
    doraIndicators: ["1m"],
    turn: 5,
    bakaze: "1z",
    seatWind: "3z",
  });
  const candidate = evaluated.candidates.find((item) => item.discard === "3p");
  assert.ok(candidate);

  assert.ok(candidate.scoreBreakdown.value > candidate.scoreBreakdown.improvement);
  assert.equal(candidate.scoreBreakdown.improvement, 1);
  assert.ok(candidate.reasons.some((reason) => (
    reason.data?.primaryRoute === "same_shanten_improvement"
  )));
});

test("normalizeStrategyPolicy preserves old partial policy calls and exposes grouped policy", () => {
  const policy = normalizeStrategyPolicy({
    ukeireWeight: 3,
    doraBonus: 120,
    sameShantenImprovementMinValue: 25,
  });

  assert.equal(policy.ukeireWeight, 3);
  assert.equal(policy.strategy.weights.ukeire, 3);
  assert.equal(policy.strategy.routes.doraBonus, 120);
  assert.equal(policy.strategy.improvement.sameShantenMinValue, 25);
  assert.equal(policy.strategy.value.scoringValueDivisor, DEFAULT_NANIKIRU_POLICY.scoringValueDivisor);
});

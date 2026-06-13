import assert from "node:assert/strict";
import test from "node:test";

import type { TileId } from "../src/core/tile.ts";
import type { DiscardCandidate } from "../src/service/analyze.ts";
import { analyzeNanikiru } from "../src/service/nanikiru.ts";
import { evaluateRiichiJudgment } from "../src/strategy/riichi.ts";

test("analyzeNanikiru returns riichi tendency for tenpai discard candidates", () => {
  const result = analyzeNanikiru({
    text: "123m123p123s456s77p",
    verbose: true,
  });

  assert.ok(result.recommendedCandidate?.riichiJudgment);
  assert.equal(result.recommendedCandidate.riichiJudgment.canRiichi, true);
  assert.equal(result.recommendedCandidate.riichiJudgment.shouldRiichi, true);
  assert.equal(result.recommendedCandidate.riichiJudgment.levelText, "建议立直");
  assert.match(result.explanation, /立直判断/);
});

test("riichi judgment discourages final-round large lead dama mangan or better", () => {
  const handAfterDiscard: TileId[] = [
    "2m", "3m", "4m",
    "2p", "3p", "4p",
    "2s", "3s", "4s",
    "5m", "5m",
    "6p", "7p",
  ];
  const candidate: DiscardCandidate = {
    discard: "7z",
    shanten: 0,
    waits: [
      { id: "5p", remaining: 4 },
      { id: "8p", remaining: 4 },
    ],
    totalWaits: 8,
    goodShapeCount: 8,
    goodShapeDraws: ["5p", "8p"],
  };

  const judgment = evaluateRiichiJudgment(handAfterDiscard, candidate, {
    turn: 10,
    seatWind: "2z",
    bakaze: "2z",
    kyoku: 4,
    points: 50000,
    opponents: [{ points: 30000 }, { points: 15000 }, { points: 5000 }],
    doraIndicators: ["4m", "4p"],
  });

  assert.equal(judgment.canRiichi, true);
  assert.equal(judgment.shouldRiichi, false);
  assert.equal(judgment.level, "strong_discourage");
  assert.ok(judgment.score <= -55);
  assert.equal(judgment.details.allWaitsHaveYaku, true);
  assert.ok(judgment.reasons.some((reason) => reason.includes("终局附近处于领先")));
});

test("low-value narrow no-yaku tenpai is not strongly recommended and prefers outer wait", () => {
  const result = analyzeNanikiru({
    text: "35m123456p789s111s",
    verbose: true,
  });

  assert.equal(result.recommendation, "5m");
  assert.deepEqual(result.recommendedCandidate?.waits.map((wait) => wait.id), ["3m"]);
  assert.equal(result.recommendedCandidate?.riichiJudgment?.levelText, "不太建议立直");
  assert.equal(result.recommendedCandidate?.riichiJudgment?.shouldRiichi, false);
  assert.ok((result.recommendedCandidate?.riichiJudgment?.details.improvementTiles ?? 0) >= 8);
  assert.ok((result.recommendedCandidate?.riichiJudgment?.details.shapeImprovementTiles ?? 0) >= 8);
  assert.ok((result.recommendedCandidate?.riichiJudgment?.details.valueImprovementTiles ?? 0) > 0);
  assert.ok(result.recommendedCandidate?.riichiJudgment?.reasons.some((reason) => (
    reason.includes("低打点窄听") && reason.includes("打点改良")
  )));
});

test("early low-value narrow tenpai chooses dama improvement route before riichi discard", () => {
  const result = analyzeNanikiru({
    text: "35m123456p789s111s",
    turn: 6,
    seatWind: "1z",
    bakaze: "1z",
    doraIndicators: ["1z"],
    verbose: true,
  });

  assert.equal(result.recommendation, "5m");
  assert.equal(result.riichiPlanDecision?.plan, "dama_improvement");
  assert.equal(result.riichiPlanDecision?.shouldRiichi, false);
  assert.equal(result.riichiPlanDecision?.damaDiscard, "5m");
  assert.equal(result.riichiPlanDecision?.riichiDiscard, "1s");
});

test("late low-value narrow tenpai can switch to riichi route discard", () => {
  const result = analyzeNanikiru({
    text: "35m123456p789s111s",
    turn: 13,
    seatWind: "1z",
    bakaze: "1z",
    doraIndicators: ["1z"],
    verbose: true,
  });

  assert.equal(result.recommendation, "1s");
  assert.equal(result.riichiPlanDecision?.plan, "riichi_now");
  assert.equal(result.riichiPlanDecision?.shouldRiichi, true);
  assert.deepEqual(result.recommendedCandidate?.waits.map((wait) => wait.id), ["4m"]);
});

test("ura estimate raises riichi tendency without overriding better riichi wait shape", () => {
  const result = analyzeNanikiru({
    text: "35m123456p789s111s",
    turn: 13,
    seatWind: "1z",
    bakaze: "1z",
    doraIndicators: ["1z", "2z"],
    verbose: true,
  });
  const ura = result.recommendedCandidate?.riichiJudgment?.details.uraEstimate;

  assert.equal(result.recommendation, "1s");
  assert.equal(result.riichiPlanDecision?.plan, "riichi_now");
  assert.equal(result.riichiPlanDecision?.riichiDiscard, "1s");
  assert.ok(ura);
  assert.equal(ura.indicatorCount, 2);
  assert.ok(ura.expectedUraHan > 0.7);
  assert.ok(ura.scoreBonus > 0);
  assert.ok(ura.reasons.some((reason) => reason.includes("里宝")));
});

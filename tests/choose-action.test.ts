import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_RULE_CONFIG } from "../src/core/rules.ts";
import type { GameState, PlayerState } from "../src/core/state.ts";
import type { TileId } from "../src/core/tile.ts";
import { chooseAction, buildVisibleTilesFromState } from "../src/strategy/choose-action.ts";
import { evaluateDefense } from "../src/strategy/evaluators/evaluate-defense.ts";
import { evaluatePlacementAdjustment } from "../src/strategy/placement.ts";

test("chooseAction keeps attack mode discard when there is no threat", () => {
  const state = makeState(["3m", "4m", "5m", "6m", "3p", "4p", "5p", "5p", "1s", "2s", "3s", "7s", "8s", "8s"]);
  const decision = chooseFast(state);

  assert.equal(decision.mode, "attack");
  assert.deepEqual(decision.action, { type: "discard", tile: "7s" });
  assert.equal(decision.analysis.recommendation, "7s");
});

test("chooseAction only arbitrates discards after a call has already resolved", () => {
  const state = makeState(
    ["2m", "3m", "4m", "3p", "4p", "5p", "2s", "3s", "4s", "7m", "8m"],
    {
      phase: "after_call_discard",
      calls: [{ type: "pon", tiles: ["5z", "5z", "5z"], calledTile: "5z", from: "right" }],
    },
  );
  const decision = chooseAction(state, {
    useEvDecision: false,
    policy: {
      useTwoLayerValueForIishanten: false,
      useScoringForTenpaiValue: false,
    },
  });

  assert.equal(decision.phase, "after_call_discard");
  assert.equal(decision.action?.type, "discard");
  assert.equal(decision.candidates.length > 0, true);
  assert.equal(decision.candidates.every((candidate) => candidate.action.type === "discard"), true);
});

test("chooseAction recommends tsumo before discard when self draw wins", () => {
  const state = makeState(
    ["1m", "2m", "3m", "4m", "5m", "6m", "7p", "8p", "9p", "2s", "3s", "2z", "2z"],
    { lastDraw: "4s" },
  );
  const decision = chooseFast(state);

  assert.equal(decision.phase, "self_draw");
  assert.deepEqual(decision.action, { type: "tsumo" });
  assert.equal(decision.candidates[0].category, "agari");
  assert.match(decision.explanation, /自摸/);
});

test("chooseAction short-circuits expensive discard analysis after valid tsumo", () => {
  const state = makeState(
    ["1m", "2m", "3m", "4m", "5m", "6m", "7p", "8p", "9p", "2s", "3s", "2z", "2z"],
    { lastDraw: "4s" },
  );
  const decision = chooseFast(state);

  assert.deepEqual(decision.action, { type: "tsumo" });
  assert.equal(decision.analysis.candidates.length, 0);
  assert.equal(decision.candidates.every((candidate) => candidate.category === "agari"), true);
});

test("chooseAction recommends ron before pass when opponent discard wins", () => {
  const state = makeState(
    ["1m", "2m", "3m", "4m", "5m", "6m", "7p", "8p", "9p", "2s", "3s", "2z", "2z"],
    { lastDiscard: "4s", lastDiscardPlayerIndex: 1 },
  );
  const decision = chooseFast(state);

  assert.equal(decision.phase, "opponent_discard");
  assert.deepEqual(decision.action, { type: "ron" });
  assert.equal(decision.candidates[0].category, "agari");
  assert.match(decision.explanation, /荣和/);
});

test("chooseAction can pass a final-hand ron that does not improve placement", () => {
  const state = makeState(
    ["1m", "2m", "3m", "4m", "5m", "6m", "7p", "8p", "9p", "2s", "3s", "3z", "3z"],
    {
      lastDiscard: "4s",
      lastDiscardPlayerIndex: 1,
      bakaze: "2z",
      kyoku: 4,
      selfSeatWind: "1z",
      selfPoints: 10000,
      opponentPoints: [25000, 30000, 35000],
    },
  );
  const decision = chooseAction(state, { useEvDecision: false });

  assert.deepEqual(decision.action, { type: "pass" });
  assert.ok(decision.candidates.some((candidate) => (
    candidate.action.type === "ron"
    && candidate.warnings.some((warning) => String(warning.message).includes("继续追逆转"))
  )));
});

test("chooseAction accepts final-hand direct ron when payer loss improves placement", () => {
  const state = makeState(
    ["1m", "2m", "3m", "4m", "5m", "6m", "7p", "8p", "9p", "2s", "3s", "3z", "3z"],
    {
      lastDiscard: "4s",
      lastDiscardPlayerIndex: 1,
      bakaze: "2z",
      kyoku: 4,
      selfSeatWind: "1z",
      selfPoints: 10000,
      opponentPoints: [11500, 30000, 35000],
    },
  );
  const decision = chooseAction(state, { useEvDecision: false });

  assert.deepEqual(decision.action, { type: "ron" });
});

test("chooseAction does not recommend ron when basic furiten applies", () => {
  const state = makeState(
    ["1m", "2m", "3m", "4m", "5m", "6m", "7p", "8p", "9p", "2s", "3s", "2z", "2z"],
    { lastDiscard: "4s", lastDiscardPlayerIndex: 1, selfDiscards: ["4s"] },
  );
  const decision = chooseFast(state);

  assert.equal(decision.phase, "opponent_discard");
  assert.deepEqual(decision.action, { type: "pass" });
});

test("chooseAction recommends yakuhai pon with follow-up discard", () => {
  const state = makeState(
    ["2m", "3m", "4m", "3p", "4p", "5p", "1s", "4s", "7m", "8m", "9p", "5z", "5z"],
    { lastDiscard: "5z", lastDiscardPlayerIndex: 1, doraIndicators: ["7z"] },
  );
  const decision = chooseAction(state, { useEvDecision: false });

  assert.equal(decision.phase, "opponent_discard");
  assert.equal(decision.action?.type, "pon");
  assert.equal(decision.action.type === "pon" ? decision.action.calledTile : undefined, "5z");
  assert.ok(decision.action.type === "pon" && decision.action.discard);
  assert.match(decision.explanation, /碰/);
});

test("chooseAction recommends high-shanten yakuhai pon when it improves speed", () => {
  const state = makeState(
    ["5z", "5z", "5s", "4p", "7s", "1m", "1s", "6m", "4z", "7z", "2p", "4s", "6s"],
    { lastDiscard: "5z", lastDiscardPlayerIndex: 1 },
  );
  const decision = chooseAction(state, { useEvDecision: false });

  assert.equal(decision.phase, "opponent_discard");
  assert.equal(decision.action?.type, "pon");
  assert.match(decision.explanation, /向听较高/);
});

test("chooseAction passes low-value yakuhai pon when far behind and menzen value is needed", () => {
  const state = makeState(
    ["2m", "3m", "4m", "3p", "4p", "5p", "1s", "4s", "7m", "8m", "9p", "5z", "5z"],
    {
      lastDiscard: "5z",
      lastDiscardPlayerIndex: 1,
      selfPoints: 12000,
      opponentPoints: [40000, 28000, 20000],
    },
  );
  const decision = chooseAction(state, { useEvDecision: false });

  assert.equal(decision.phase, "opponent_discard");
  assert.deepEqual(decision.action, { type: "pass" });
  assert.ok(decision.candidates.some((candidate) => (
    candidate.category === "call"
    && candidate.reasons.some((reason) => String(reason.message).includes("门清立直提升打点"))
  )));
});

test("chooseAction passes yakuhai pon when menzen good tenpai is already available", () => {
  const state = makeState(
    ["2m", "3m", "4m", "3p", "4p", "5p", "2s", "3s", "4s", "7m", "8m", "5z", "5z"],
    { lastDiscard: "5z", lastDiscardPlayerIndex: 1 },
  );
  const decision = chooseAction(state, { useEvDecision: false });

  assert.equal(decision.phase, "opponent_discard");
  assert.deepEqual(decision.action, { type: "pass" });
  assert.match(decision.explanation, /已经听牌/);
  assert.match(decision.explanation, /门清立直/);
});

test("chooseAction recommends tanyao chi from left player", () => {
  const state = makeState(
    ["2m", "3m", "4m", "3p", "4p", "6p", "7p", "8p", "2s", "3s", "6s", "7s", "8s"],
    { lastDiscard: "5p", lastDiscardPlayerIndex: 3 },
  );
  const decision = chooseAction(state, { useEvDecision: false });

  assert.equal(decision.phase, "opponent_discard");
  assert.equal(decision.action?.type, "chi");
  assert.equal(decision.action.type === "chi" ? decision.action.calledTile : undefined, "5p");
  assert.ok(decision.action.type === "chi" && decision.action.discard);
});

test("chooseAction passes guest wind pon without a clear yaku", () => {
  const state = makeState(
    ["2m", "3m", "4m", "3p", "4p", "5p", "2s", "3s", "4s", "7m", "8m", "2z", "2z"],
    { lastDiscard: "2z", lastDiscardPlayerIndex: 1 },
  );
  const decision = chooseAction(state, { useEvDecision: false });

  assert.equal(decision.phase, "opponent_discard");
  assert.deepEqual(decision.action, { type: "pass" });
});

test("chooseAction stays conservative on calls against riichi", () => {
  const state = makeState(
    ["2m", "3m", "4m", "3p", "4p", "5p", "2s", "3s", "4s", "7m", "8m", "5z", "5z"],
    { lastDiscard: "5z", lastDiscardPlayerIndex: 1, opponentRiichi: true, opponentDiscards: ["1z", "9m"] },
  );
  const decision = chooseAction(state, { useEvDecision: false });

  assert.equal(decision.phase, "opponent_discard");
  assert.deepEqual(decision.action, { type: "pass" });
});

test("chooseAction can recommend ankan when no one threatens and hand is ready", () => {
  const state = makeState(
    ["1m", "1m", "1m", "2m", "3m", "4m", "2p", "3p", "4p", "2s", "3s", "4s", "5s"],
    { lastDraw: "1m", doraIndicators: ["9m"] },
  );
  const decision = chooseAction(state, { useEvDecision: false });

  assert.equal(decision.phase, "self_draw");
  assert.equal(decision.action?.type, "ankan");
  assert.deepEqual(decision.action.type === "ankan" ? decision.action.tiles : undefined, ["1m", "1m", "1m", "1m"]);
  assert.match(decision.explanation, /暗杠/);
});

test("chooseAction does not recommend minkan against riichi", () => {
  const state = makeState(
    ["1m", "1m", "1m", "2m", "3m", "4m", "2p", "3p", "4p", "2s", "3s", "4s", "5s"],
    { lastDiscard: "1m", lastDiscardPlayerIndex: 1, opponentRiichi: true, opponentDiscards: ["9m", "1z"] },
  );
  const decision = chooseAction(state, { useEvDecision: false });

  assert.equal(decision.phase, "opponent_discard");
  assert.deepEqual(decision.action, { type: "pass" });
  assert.ok(decision.candidates.some((candidate) => (
    candidate.action.type === "minkan"
    && candidate.warnings.some((warning) => String(warning.message).includes("新宝牌风险"))
  )));
});

test("chooseAction does not recommend kakan when leading near final", () => {
  const state = makeState(
    ["1m", "2m", "3m", "2p", "3p", "4p", "2s", "3s", "4s", "7z"],
    {
      lastDraw: "5s",
      calls: [{ type: "pon", tiles: ["7z", "7z", "7z"], calledTile: "7z", from: "right" }],
      selfPoints: 45000,
      opponentPoints: [30000, 15000, 10000],
      bakaze: "2z",
      kyoku: 4,
    },
  );
  const decision = chooseAction(state, { useEvDecision: false });

  assert.equal(decision.phase, "self_draw");
  assert.notEqual(decision.action?.type, "kakan");
  assert.ok(decision.candidates.some((candidate) => (
    candidate.action.type === "kakan"
    && candidate.warnings.some((warning) => String(warning.message).includes("终局附近"))
  )));
});

test("chooseAction upgrades a strong tenpai discard into a riichi action", () => {
  const state = makeState(["1m", "2m", "3m", "1p", "2p", "3p", "1s", "2s", "3s", "4s", "5s", "6s", "7p", "7p"]);
  const decision = chooseFast(state);

  assert.equal(decision.action?.type, "riichi");
  assert.equal(decision.candidates[0].category, "riichi");
  assert.match(decision.explanation, /立直/);
});

test("chooseAction keeps discard when riichi judgment discourages riichi", () => {
  const state = makeState(
    ["2m", "3m", "4m", "2p", "3p", "4p", "2s", "3s", "4s", "5m", "5m", "6p", "7p", "7z"],
    {
      turn: 10,
      bakaze: "2z",
      kyoku: 4,
      selfSeatWind: "2z",
      selfPoints: 50000,
      opponentPoints: [30000, 15000, 5000],
      doraIndicators: ["4m", "4p"],
    },
  );
  const decision = chooseFast(state);

  assert.equal(decision.action?.type, "discard");
  assert.equal(decision.candidates[0].category, "discard");
});

test("chooseAction prefers early improvement over high-value bad-shape narrow riichi", () => {
  const state = makeState(
    ["3m", "5m", "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "1s", "1s", "1s"],
    {
      turn: 6,
      doraIndicators: ["9s"],
      bakaze: "1z",
      selfSeatWind: "1z",
    },
  );
  const decision = chooseAction(state, {
    policy: {
      twoLayerMaxDrawTypes: 2,
      twoLayerMaxTenpaiDiscards: 1,
      sameShantenImprovementMaxDrawTypes: 3,
    },
  });

  assert.deepEqual(decision.action, { type: "discard", tile: "5m" });
  assert.equal(decision.analysis.riichiPlanDecision?.plan, "dama_improvement");
  assert.equal(decision.analysis.candidates[0]?.riichiJudgment?.shouldRiichi, false);
  assert.ok((decision.analysis.candidates[0]?.riichiJudgment?.details.shapeImprovementTiles ?? 0) >= 8);
  assert.doesNotMatch(decision.explanation, /全带/);
  assert.equal(decision.analysis.candidates[0]?.reasons.some((reason) => (
    reason.type === "route"
    && String(reason.message).includes("全带")
  )), false);
});

test("chooseAction does not prefer breaking dora-side taatsu by stepping back from iishanten", () => {
  const state = makeState(
    ["3m", "4m", "5m", "6m", "7m", "7m", "3p", "4p", "4p", "5p", "6p", "8p", "3s", "5s"],
    {
      doraIndicators: ["4s"],
      turn: 6,
    },
  );
  const decision = chooseFast(state);
  const shantenBack = decision.analysis.candidates.find((candidate) => candidate.discard === "3s");

  assert.equal(decision.mode, "attack");
  assert.deepEqual(decision.action, { type: "discard", tile: "6m" });
  assert.equal(decision.analysis.recommendation, "6m");
  assert.ok(shantenBack);
  assert.equal(shantenBack.shanten, 2);
  assert.equal(shantenBack.reasons.some((reason) => (
    reason.type === "ukeire"
    && String(reason.message).includes("退向")
  )), true);
});

test("chooseAction can step back from early low-value tenpai for dora good-shape improvement", () => {
  const state = makeState(
    ["2p", "2p", "2p", "3p", "5p", "7p", "1s", "2s", "3s", "5s", "6s", "7s", "8s", "1p"],
    {
      doraIndicators: ["7p"],
      turn: 6,
      bakaze: "1z",
      selfSeatWind: "1z",
    },
  );
  const decision = chooseFast(state);
  const fivePin = decision.analysis.candidates[0];

  assert.equal(decision.mode, "attack");
  assert.deepEqual(decision.action, { type: "discard", tile: "5p" });
  assert.equal(fivePin.discard, "5p");
  assert.equal(fivePin.shanten, 1);
  assert.ok(fivePin.reasons.some((reason) => (
    reason.type === "ukeire"
    && String(reason.message).includes("当前低价值窄听")
    && String(reason.message).includes("退向后的")
    && String(reason.message).includes("好形相关进张")
    && String(reason.message).includes("好形率")
    && typeof reason.data?.goodShapeRatio === "number"
  )));
});

test("chooseAction does not step back from low-value tenpai against riichi", () => {
  const state = makeState(
    ["2p", "2p", "2p", "3p", "5p", "7p", "1s", "2s", "3s", "5s", "6s", "7s", "8s", "1p"],
    {
      doraIndicators: ["7p"],
      turn: 6,
      bakaze: "1z",
      selfSeatWind: "1z",
      opponentRiichi: true,
      opponentDiscards: ["9m", "1z"],
    },
  );
  const decision = chooseFast(state);

  assert.equal(decision.mode, "push");
  assert.equal(decision.analysis.candidates[0].shanten, 0);
});

test("chooseAction shifts to defense against riichi and can prefer genbutsu", () => {
  const state = makeState(
    ["3m", "4m", "5m", "3p", "5p", "1s", "3s", "7s", "8s", "9s", "1z", "2z", "3z", "4z"],
    {
      opponentRiichi: true,
      opponentDiscards: ["4z", "6m", "9p"],
    },
  );
  const decision = chooseFast(state);

  assert.equal(decision.mode, "defense");
  assert.deepEqual(decision.action, { type: "discard", tile: "4z" });
  assert.ok(decision.analysis.candidates[0].reasons.some((reason) => (
    reason.type === "defense"
    && String(reason.message).includes("现物")
  )));
  assert.match(decision.explanation, /防守模式/);
});

test("chooseAction pushes high-value iishanten hands against riichi", () => {
  const state = makeState(
    ["3m", "4m", "5m", "6m", "3p", "4p", "5p", "5p", "1s", "2s", "3s", "7s", "8s", "8s"],
    {
      opponentRiichi: true,
      opponentDiscards: ["4z", "6m", "9p"],
      doraIndicators: ["4m", "4p"],
    },
  );
  const decision = chooseFast(state);

  assert.equal(decision.mode, "push");
  assert.match(decision.explanation, /一向听且打点较高/);
});

test("chooseAction does not explain dora yakuhai pair hands as tanyao leaning", () => {
  const state = makeState(
    ["6p", "6p", "7p", "8p", "9p", "3s", "5s", "6s", "7s", "7s", "7s", "7z", "7z", "2s"],
    {
      doraIndicators: ["6z"],
      bakaze: "1z",
      selfSeatWind: "1z",
      turn: 8,
    },
  );
  const decision = chooseFast(state);

  assert.deepEqual(decision.action, { type: "discard", tile: "6p" });
  assert.doesNotMatch(decision.explanation, /断幺路线/);
  assert.match(decision.explanation, /宝牌/);
  assert.match(decision.explanation, /避免听牌时再切/);
  assert.ok(decision.analysis.candidates[0]?.reasons.some((reason) => (
    reason.type === "value"
    && String(reason.message).includes("役牌对子 7z")
  )));
});

test("chooseAction shifts balance hands toward defense when leading near final", () => {
  const state = makeState(
    ["3m", "4m", "5m", "6m", "3p", "4p", "5p", "5p", "1s", "2s", "3s", "7s", "8s", "8s"],
    {
      opponentRiichi: true,
      opponentDiscards: ["4z", "6m", "9p"],
      selfPoints: 45000,
      opponentPoints: [30000, 10000, 5000],
      bakaze: "2z",
      kyoku: 4,
    },
  );
  const decision = chooseFast(state);

  assert.equal(decision.mode, "defense");
  assert.ok(decision.analysis.candidates[0].reasons.some((reason) => (
    reason.type === "placement"
    && String(reason.message).includes("终局附近")
  )));
});

test("chooseAction shifts balance hands toward push when trailing in south round", () => {
  const state = makeState(
    ["3m", "4m", "5m", "6m", "3p", "4p", "5p", "5p", "1s", "2s", "3s", "7s", "8s", "8s"],
    {
      opponentRiichi: true,
      opponentDiscards: ["4z", "6m", "9p"],
      selfPoints: 10000,
      opponentPoints: [40000, 30000, 20000],
      bakaze: "2z",
      kyoku: 2,
    },
  );
  const decision = chooseFast(state);

  assert.equal(decision.mode, "push");
  assert.ok(decision.analysis.candidates[0].reasons.some((reason) => (
    reason.type === "placement"
    && String(reason.message).includes("南场落后")
  )));
});

test("evaluatePlacementAdjustment accounts for dealer value and dealer threats", () => {
  const selfDealerState = makeState(
    ["3m", "4m", "5m", "6m", "3p", "4p", "5p", "5p", "1s", "2s", "3s", "7s", "8s", "8s"],
  );
  const selfDealer = evaluatePlacementAdjustment(selfDealerState);

  assert.ok(selfDealer.pushBias > 0);
  assert.ok(selfDealer.valueWeightMul > 1);
  assert.ok(selfDealer.reasons.some((reason) => String(reason.message).includes("自家亲家")));

  const dealerThreatState = makeState(
    ["3m", "4m", "5m", "6m", "3p", "4p", "5p", "5p", "1s", "2s", "3s", "7s", "8s", "8s"],
    {
      selfSeatWind: "2z",
      opponentRiichi: true,
      opponentSeatWinds: ["1z", "3z", "4z"],
    },
  );
  const dealerThreat = evaluatePlacementAdjustment(dealerThreatState);

  assert.ok(dealerThreat.pushBias < 0);
  assert.ok(dealerThreat.defenseWeightMul > 1);
  assert.ok(dealerThreat.reasons.some((reason) => String(reason.message).includes("威胁者是亲家")));
});

test("south four close third does not fold from an early slow hand", () => {
  const state = makeState(
    ["1m", "3m", "5m", "7m", "9m", "1p", "3p", "5p", "7p", "9p", "1s", "3s", "5s", "7s"],
    {
      selfPoints: 23000,
      opponentPoints: [30000, 27000, 20000],
      bakaze: "2z",
      kyoku: 4,
      turn: 1,
    },
  );
  const placement = evaluatePlacementAdjustment(state, { shanten: 3, highValueHand: false });
  const decision = chooseFast(state);

  assert.equal(placement.avoidFourthGoal, "none");
  assert.equal(decision.mode, "attack");
});

test("south four close third in tenpai treats winning out as avoid-fourth route", () => {
  const state = makeState(
    ["2m", "3m", "4m", "2p", "3p", "4p", "2s", "3s", "4s", "5m", "5m", "6p", "6p", "7p"],
    {
      selfPoints: 23000,
      opponentPoints: [30000, 27000, 20000],
      bakaze: "2z",
      kyoku: 4,
      turn: 9,
    },
  );
  const placement = evaluatePlacementAdjustment(state, { shanten: 0, highValueHand: false });
  const decision = chooseFast(state);

  assert.equal(placement.avoidFourthGoal, "winOut");
  assert.ok(placement.ukeireWeightMul > 1);
  assert.equal(decision.mode, "push");
  assert.ok(decision.analysis.candidates[0].reasons.some((reason) => (
    reason.type === "placement"
    && String(reason.message).includes("和牌结束")
  )));
});

test("south four close third iishanten values tenpai keeping", () => {
  const state = makeState(
    ["3m", "4m", "5m", "6m", "3p", "4p", "5p", "5p", "1s", "2s", "3s", "7s", "8s", "8s"],
    {
      selfPoints: 23000,
      opponentPoints: [30000, 27000, 20000],
      bakaze: "2z",
      kyoku: 4,
      turn: 9,
    },
  );
  const placement = evaluatePlacementAdjustment(state, { shanten: 1, highValueHand: false });

  assert.equal(placement.avoidFourthGoal, "tenpaiKeep");
  assert.ok(placement.shantenWeightMul > 1);
  assert.ok(placement.ukeireWeightMul > 1);
  assert.ok(placement.valueWeightMul < 1);
  assert.ok(placement.reasons.some((reason) => String(reason.message).includes("流局听牌")));
});

test("south four close third slow late hand folds against fourth threat", () => {
  const state = makeState(
    ["1m", "3m", "5m", "7m", "9m", "1p", "3p", "5p", "7p", "9p", "1s", "3s", "5s", "7s"],
    {
      selfPoints: 23000,
      opponentPoints: [30000, 27000, 20000],
      bakaze: "2z",
      kyoku: 4,
      turn: 13,
    },
  );
  state.opponents[2].riichi = true;
  const placement = evaluatePlacementAdjustment(state, { shanten: 3, highValueHand: false });

  assert.equal(placement.avoidFourthGoal, "fold");
  assert.ok(placement.defenseWeightMul > 1.7);
  assert.ok(placement.pushBias < 0);
  assert.equal(placement.context.fourthThreatening, true);
  assert.ok(placement.reasons.some((reason) => String(reason.message).includes("避免放铳落四")));
});

test("south four fourth place chases instead of avoid-fourth folding", () => {
  const state = makeState(
    ["3m", "4m", "5m", "6m", "3p", "4p", "5p", "5p", "1s", "2s", "3s", "7s", "8s", "8s"],
    {
      selfPoints: 20000,
      opponentPoints: [30000, 27000, 23000],
      bakaze: "2z",
      kyoku: 4,
      turn: 9,
    },
  );
  const placement = evaluatePlacementAdjustment(state, { shanten: 1, highValueHand: false });

  assert.equal(placement.avoidFourthGoal, "chase");
  assert.ok(placement.valueWeightMul > 1);
  assert.ok(placement.pushBias > 0);
  assert.ok(placement.reasons.some((reason) => String(reason.message).includes("脱四")));
});

test("evaluateDefense marks dora against riichi as risky", () => {
  const evaluation = evaluateDefense("5m", {
    turn: 10,
    doraIndicators: ["4m"],
    opponents: [{
      seatWind: "2z",
      riichi: true,
      discards: [{ tile: "9p", tsumogiri: false }],
      calls: [],
    }],
  });

  assert.ok(evaluation.score < -100);
  assert.ok(evaluation.reasons.some((reason) => (
    reason.type === "risk"
    && String(reason.message).includes("宝牌")
  )));
});

test("evaluateDefense scores weak suji lower than terminal suji", () => {
  const context = {
    turn: 10,
    opponents: [{
      seatWind: "2z" as const,
      riichi: true,
      discards: [
        { tile: "4m" as const, tsumogiri: false },
        { tile: "5m" as const, tsumogiri: false },
        { tile: "6m" as const, tsumogiri: false },
        { tile: "7m" as const, tsumogiri: false },
      ],
      calls: [],
    }],
  };

  const terminalSuji = evaluateDefense("1m", context).score;
  const twoEightSuji = evaluateDefense("2m", context).score;
  const middleSuji = evaluateDefense("4m", {
    ...context,
    opponents: [{
      ...context.opponents[0],
      discards: [
        { tile: "5m" as const, tsumogiri: false },
        { tile: "6m" as const, tsumogiri: false },
        { tile: "7m" as const, tsumogiri: false },
      ],
    }],
  }).score;
  const threeSevenSuji = evaluateDefense("3m", context).score;

  assert.ok(terminalSuji > twoEightSuji);
  assert.ok(twoEightSuji > middleSuji);
  assert.ok(middleSuji > threeSevenSuji);
});

test("evaluateDefense penalizes discards that leave too little defense reserve", () => {
  const context = {
    turn: 10,
    opponents: [{
      seatWind: "2z" as const,
      riichi: true,
      discards: [{ tile: "4z" as const, tsumogiri: false }, { tile: "6m" as const, tsumogiri: false }],
      calls: [],
    }],
  };

  const lowReserve = evaluateDefense("4z", context, ["9m"]);
  const highReserve = evaluateDefense("4z", context, ["4z", "6m", "9m"]);

  assert.ok(lowReserve.score < highReserve.score);
  assert.ok(lowReserve.reasons.some((reason) => (
    reason.type === "risk"
    && String(reason.message).includes("后续防守资源偏少")
  )));
});

test("evaluateDefense grades non-suji middle tile danger", () => {
  const context = {
    turn: 10,
    opponents: [{
      seatWind: "2z" as const,
      riichi: true,
      discards: [{ tile: "1z" as const, tsumogiri: false }],
      calls: [],
    }],
  };

  const five = evaluateDefense("5m", context);
  const four = evaluateDefense("4m", context);
  const three = evaluateDefense("3m", context);
  const two = evaluateDefense("2m", context);

  assert.ok(five.score < four.score);
  assert.ok(four.score < three.score);
  assert.ok(three.score < two.score);
  assert.ok(five.reasons.some((reason) => (
    reason.type === "risk"
    && String(reason.message).includes("无筋中张")
    && reason.data?.middleDanger === 30
  )));
});

test("evaluateDefense raises risk during ippatsu", () => {
  const baseOpponent = {
    seatWind: "2z" as const,
    riichi: true,
    discards: [{ tile: "1z" as const, tsumogiri: false }],
    calls: [],
  };
  const normal = evaluateDefense("5m", {
    turn: 10,
    opponents: [baseOpponent],
  });
  const ippatsu = evaluateDefense("5m", {
    turn: 10,
    opponents: [{ ...baseOpponent, ippatsu: true }],
  });

  assert.ok(ippatsu.score < normal.score);
  assert.ok(ippatsu.reasons.some((reason) => (
    reason.type === "risk"
    && String(reason.message).includes("一发巡")
  )));
});

test("evaluateDefense raises risk against dealer threats", () => {
  const childThreat = evaluateDefense("5m", {
    turn: 10,
    opponents: [{
      seatWind: "2z" as const,
      riichi: true,
      discards: [{ tile: "1z" as const, tsumogiri: false }],
      calls: [],
    }],
  });
  const dealerThreat = evaluateDefense("5m", {
    turn: 10,
    opponents: [{
      seatWind: "1z" as const,
      riichi: true,
      discards: [{ tile: "1z" as const, tsumogiri: false }],
      calls: [],
    }],
  });

  assert.ok(dealerThreat.score < childThreat.score);
  assert.ok(dealerThreat.reasons.some((reason) => (
    reason.type === "risk"
    && String(reason.message).includes("亲家")
  )));
});

function makeState(hand: TileId[], options: {
  opponentRiichi?: boolean;
  opponentDiscards?: TileId[];
  doraIndicators?: TileId[];
  selfPoints?: number;
  opponentPoints?: [number, number, number];
  selfDiscards?: TileId[];
  selfSeatWind?: "1z" | "2z" | "3z" | "4z";
  opponentSeatWinds?: ["1z" | "2z" | "3z" | "4z", "1z" | "2z" | "3z" | "4z", "1z" | "2z" | "3z" | "4z"];
  bakaze?: "1z" | "2z" | "3z" | "4z";
  kyoku?: number;
  turn?: number;
  lastDraw?: TileId;
  lastDiscard?: TileId;
  lastDiscardPlayerIndex?: number;
  calls?: PlayerState["calls"];
  phase?: GameState["phase"];
} = {}): GameState {
  const self: PlayerState = {
    seatWind: options.selfSeatWind ?? "1z",
    points: options.selfPoints ?? 25000,
    hand,
    calls: options.calls ?? [],
    discards: (options.selfDiscards ?? []).map((tile) => ({ tile, tsumogiri: false })),
    riichi: false,
    ippatsu: false,
    menzen: (options.calls ?? []).every((call) => call.type === "ankan"),
  };
  const opponents: PlayerState[] = [
    {
      seatWind: options.opponentSeatWinds?.[0] ?? "2z",
      points: options.opponentPoints?.[0] ?? 25000,
      calls: [],
      discards: (options.opponentDiscards ?? []).map((tile) => ({ tile, tsumogiri: false })),
      riichi: options.opponentRiichi ?? false,
      ippatsu: false,
      menzen: true,
    },
    makeOpponent(options.opponentSeatWinds?.[1] ?? "3z", options.opponentPoints?.[1] ?? 25000),
    makeOpponent(options.opponentSeatWinds?.[2] ?? "4z", options.opponentPoints?.[2] ?? 25000),
  ];
  const stateWithoutVisible = {
    round: {
      bakaze: options.bakaze ?? "1z",
      kyoku: options.kyoku ?? 1,
      honba: 0,
      riichiSticks: 0,
      turn: options.turn ?? 9,
    },
    self,
    opponents,
    doraIndicators: options.doraIndicators ?? [],
    phase: options.phase,
    lastDraw: options.lastDraw,
    lastDiscard: options.lastDiscard
      ? { tile: options.lastDiscard, tsumogiri: false, playerIndex: options.lastDiscardPlayerIndex ?? 1 }
      : undefined,
    rules: DEFAULT_RULE_CONFIG,
  };

  return {
    ...stateWithoutVisible,
    visibleTiles: buildVisibleTilesFromState(stateWithoutVisible),
  };
}

function chooseFast(state: GameState): ReturnType<typeof chooseAction> {
  return chooseAction(state, {
    useEvDecision: false,
    policy: {
      twoLayerMaxDrawTypes: 2,
      twoLayerMaxTenpaiDiscards: 1,
      sameShantenImprovementMaxDrawTypes: 3,
    },
  });
}

function makeOpponent(seatWind: "1z" | "2z" | "3z" | "4z", points = 25000): PlayerState {
  return {
    seatWind,
    points,
    calls: [],
    discards: [],
    riichi: false,
    ippatsu: false,
    menzen: true,
  };
}

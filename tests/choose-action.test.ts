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
  const decision = chooseAction(state);

  assert.equal(decision.mode, "attack");
  assert.deepEqual(decision.action, { type: "discard", tile: "7s" });
  assert.equal(decision.analysis.recommendation, "7s");
});

test("chooseAction does not prefer breaking dora-side taatsu by stepping back from iishanten", () => {
  const state = makeState(
    ["3m", "4m", "5m", "6m", "7m", "7m", "3p", "4p", "4p", "5p", "6p", "8p", "3s", "5s"],
    {
      doraIndicators: ["4s"],
      turn: 6,
    },
  );
  const decision = chooseAction(state);
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
  const decision = chooseAction(state);
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
  const decision = chooseAction(state);

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
  const decision = chooseAction(state);

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
  const decision = chooseAction(state);

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
  const decision = chooseAction(state);

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
  const decision = chooseAction(state);

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
  const decision = chooseAction(state);

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
  const decision = chooseAction(state);

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
  const decision = chooseAction(state);

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
  selfSeatWind?: "1z" | "2z" | "3z" | "4z";
  opponentSeatWinds?: ["1z" | "2z" | "3z" | "4z", "1z" | "2z" | "3z" | "4z", "1z" | "2z" | "3z" | "4z"];
  bakaze?: "1z" | "2z" | "3z" | "4z";
  kyoku?: number;
  turn?: number;
} = {}): GameState {
  const self: PlayerState = {
    seatWind: options.selfSeatWind ?? "1z",
    points: options.selfPoints ?? 25000,
    hand,
    calls: [],
    discards: [],
    riichi: false,
    ippatsu: false,
    menzen: true,
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
    rules: DEFAULT_RULE_CONFIG,
  };

  return {
    ...stateWithoutVisible,
    visibleTiles: buildVisibleTilesFromState(stateWithoutVisible),
  };
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

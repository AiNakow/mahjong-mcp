import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_RULE_CONFIG } from "../src/core/rules.ts";
import type { GameState, PlayerState } from "../src/core/state.ts";
import type { TileId } from "../src/core/tile.ts";
import { chooseAction, buildVisibleTilesFromState } from "../src/strategy/choose-action.ts";
import { evaluateDefense } from "../src/strategy/evaluators/evaluate-defense.ts";

test("chooseAction keeps attack mode discard when there is no threat", () => {
  const state = makeState(["3m", "4m", "5m", "6m", "3p", "4p", "5p", "5p", "1s", "2s", "3s", "7s", "8s", "8s"]);
  const decision = chooseAction(state);

  assert.equal(decision.mode, "attack");
  assert.deepEqual(decision.action, { type: "discard", tile: "7s" });
  assert.equal(decision.analysis.recommendation, "7s");
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

function makeState(hand: TileId[], options: {
  opponentRiichi?: boolean;
  opponentDiscards?: TileId[];
} = {}): GameState {
  const self: PlayerState = {
    seatWind: "1z",
    points: 25000,
    hand,
    calls: [],
    discards: [],
    riichi: false,
    ippatsu: false,
    menzen: true,
  };
  const opponents: PlayerState[] = [
    {
      seatWind: "2z",
      points: 25000,
      calls: [],
      discards: (options.opponentDiscards ?? []).map((tile) => ({ tile, tsumogiri: false })),
      riichi: options.opponentRiichi ?? false,
      ippatsu: false,
      menzen: true,
    },
    makeOpponent("3z"),
    makeOpponent("4z"),
  ];
  const stateWithoutVisible = {
    round: {
      bakaze: "1z" as const,
      kyoku: 1,
      honba: 0,
      riichiSticks: 0,
      turn: 9,
    },
    self,
    opponents,
    doraIndicators: [],
    rules: DEFAULT_RULE_CONFIG,
  };

  return {
    ...stateWithoutVisible,
    visibleTiles: buildVisibleTilesFromState(stateWithoutVisible),
  };
}

function makeOpponent(seatWind: "2z" | "3z" | "4z"): PlayerState {
  return {
    seatWind,
    points: 25000,
    calls: [],
    discards: [],
    riichi: false,
    ippatsu: false,
    menzen: true,
  };
}

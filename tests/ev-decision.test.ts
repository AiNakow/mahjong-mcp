import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_RULE_CONFIG } from "../src/core/rules.ts";
import type { GameState, PlayerState } from "../src/core/state.ts";
import type { TileId } from "../src/core/tile.ts";
import { buildVisibleTilesFromState } from "../src/strategy/choose-action.ts";
import { applyEvDecision } from "../src/strategy/ev-decision.ts";
import type { EvaluatedNanikiruAnalysis, EvaluatedNanikiruCandidate } from "../src/strategy/evaluate-nanikiru.ts";

test("EV decision reorders close candidates when round income and deal-in risk clearly differ", () => {
  const state = makeState();
  const analysis = makeAnalysis([
    makeCandidate("5m", 100),
    makeCandidate("1z", 95),
  ]);

  applyEvDecision(analysis, state, { mode: "balance" });

  assert.equal(analysis.recommendation, "1z");
  assert.equal(analysis.candidates[0].discard, "1z");
  assert.ok(analysis.candidates[0].estimate);
  assert.notEqual(analysis.candidates[0].scoreBreakdown.ev, 0);
  assert.ok(analysis.candidates[0].reasons.some((reason) => (
    reason.type === "ev"
    && String(reason.message).includes("局收支估算")
  )));
});

test("EV decision can be disabled", () => {
  const state = makeState();
  const analysis = makeAnalysis([
    makeCandidate("5m", 100),
    makeCandidate("1z", 95),
  ]);

  applyEvDecision(analysis, state, { enabled: false, mode: "balance" });

  assert.equal(analysis.recommendation, "5m");
  assert.equal(analysis.candidates[0].estimate, undefined);
});

function makeAnalysis(candidates: EvaluatedNanikiruCandidate[]): EvaluatedNanikiruAnalysis {
  return {
    input: "123m123p123s55m11z",
    handText: "123m123p123s55m11z",
    hand: ["1m", "2m", "3m", "1p", "2p", "3p", "1s", "2s", "3s", "5m", "5m", "1z", "1z", "5p"],
    tileCount: 14,
    shanten: 0,
    isTenpai: true,
    isAgari: false,
    candidates,
    recommendation: candidates[0]?.discard,
  };
}

function makeCandidate(discard: TileId, score: number): EvaluatedNanikiruCandidate {
  return {
    discard,
    shanten: 0,
    waits: [{ id: "5p", remaining: 4 }],
    totalWaits: 4,
    goodShapeCount: 0,
    goodShapeDraws: [],
    score,
    scoreBreakdown: {
      shanten: 0,
      ukeire: score,
      goodShape: 0,
      shape: 0,
      route: 0,
      value: 0,
      improvement: 0,
      defense: 0,
      ev: 0,
    },
    reasons: [],
  };
}

function makeState(): GameState {
  const self: PlayerState = {
    seatWind: "2z",
    points: 25000,
    hand: ["1m", "2m", "3m", "1p", "2p", "3p", "1s", "2s", "3s", "5m", "5m", "1z", "1z", "5p"],
    calls: [],
    discards: [],
    riichi: false,
    ippatsu: false,
    menzen: true,
  };
  const stateWithoutVisible = {
    round: {
      bakaze: "1z" as const,
      kyoku: 1,
      honba: 0,
      riichiSticks: 0,
      turn: 14,
    },
    self,
    opponents: [
      makeOpponent("1z", true, ["9p", "2z"]),
      makeOpponent("3z", false, []),
      makeOpponent("4z", false, []),
    ],
    doraIndicators: [],
    rules: DEFAULT_RULE_CONFIG,
  };
  return {
    ...stateWithoutVisible,
    visibleTiles: buildVisibleTilesFromState(stateWithoutVisible),
  };
}

function makeOpponent(seatWind: "1z" | "2z" | "3z" | "4z", riichi: boolean, discards: TileId[]): PlayerState {
  return {
    seatWind,
    points: 25000,
    calls: [],
    discards: discards.map((tile) => ({ tile, tsumogiri: false })),
    riichi,
    ippatsu: false,
    menzen: true,
  };
}

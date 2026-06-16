import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_RULE_CONFIG } from "../src/core/rules.ts";
import type { GameState, PlayerState } from "../src/core/state.ts";
import type { TileId } from "../src/core/tile.ts";
import type { LegalAction } from "../src/strategy/legal-actions.ts";
import type { EvaluatedNanikiruAnalysis, EvaluatedNanikiruCandidate } from "../src/strategy/evaluate-nanikiru.ts";
import { discardAnalysisToActions, riichiAnalysisToActions } from "../src/strategy/evaluate-action.ts";

test("riichiAnalysisToActions only upgrades discards present in legal actions", () => {
  const state = makeState();
  const analysis = makeAnalysis([
    makeCandidate("1m", 120),
    makeCandidate("9m", 110),
  ]);
  const legalActions: LegalAction[] = [{
    action: { type: "riichi", tile: "9m" },
    phase: "self_draw",
    category: "riichi",
  }];

  const actions = riichiAnalysisToActions(analysis, "self_draw", state, legalActions);

  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0]?.action, { type: "riichi", tile: "9m" });
});

test("discardAnalysisToActions only returns discards present in legal actions", () => {
  const analysis = makeAnalysis([
    makeCandidate("1m", 120),
    makeCandidate("9m", 110),
  ]);
  const legalActions: LegalAction[] = [{
    action: { type: "discard", tile: "9m" },
    phase: "after_call_discard",
    category: "discard",
  }];

  const actions = discardAnalysisToActions(analysis, "after_call_discard", legalActions);

  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0]?.action, { type: "discard", tile: "9m" });
});

function makeAnalysis(candidates: EvaluatedNanikiruCandidate[]): EvaluatedNanikiruAnalysis {
  return {
    input: "123m123p123s789m11z",
    handText: "123m123p123s789m11z",
    hand: ["1m", "2m", "3m", "1p", "2p", "3p", "1s", "2s", "3s", "7m", "8m", "9m", "1z", "1z"],
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
    waits: [{ id: "1z", remaining: 2 }],
    totalWaits: 2,
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
    riichiJudgment: {
      canRiichi: true,
      shouldRiichi: true,
      score: 80,
      level: "recommend",
      levelText: "建议立直",
      confidence: 0.9,
      reasons: ["测试立直理由"],
      details: {
        damaAveragePoints: 1300,
        riichiAveragePoints: 2600,
        pointGain: 1300,
        totalWaits: 2,
        goodShapeRatio: 0,
        allWaitsHaveYaku: false,
        anyWaitHasYaku: true,
        improvementTiles: 0,
        improvementDraws: [],
        shapeImprovementTiles: 0,
        valueImprovementTiles: 0,
        valueImprovementDraws: [],
        bestImprovedWaits: 0,
        bestImprovedDamaPoints: 0,
        improvementTurnMultiplier: 1,
        uraEstimate: {
          indicatorCount: 1,
          expectedUraHan: 0.3,
          hitRate: 0.3,
          multiHitRate: 0,
          expectedScoreGain: 300,
          upgrade: "none",
          upgradeProbability: 0,
          scoreBonus: 5,
          reasons: [],
        },
        remainingTurns: 8,
      },
    },
  };
}

function makeState(): GameState {
  const self: PlayerState = {
    seatWind: "1z",
    points: 25000,
    hand: ["1m", "2m", "3m", "1p", "2p", "3p", "1s", "2s", "3s", "7m", "8m", "9m", "1z"],
    calls: [],
    discards: [],
    riichi: false,
    ippatsu: false,
    menzen: true,
  };
  return {
    round: {
      bakaze: "1z",
      kyoku: 1,
      honba: 0,
      riichiSticks: 0,
      turn: 9,
    },
    self,
    opponents: [
      makeOpponent("2z"),
      makeOpponent("3z"),
      makeOpponent("4z"),
    ],
    doraIndicators: [],
    visibleTiles: Array(34).fill(0),
    lastDraw: "1z",
    rules: DEFAULT_RULE_CONFIG,
  };
}

function makeOpponent(seatWind: "1z" | "2z" | "3z" | "4z"): PlayerState {
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

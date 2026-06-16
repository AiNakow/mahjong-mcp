import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_RULE_CONFIG } from "../src/core/rules.ts";
import { createEmptyCounts34 } from "../src/core/counts.ts";
import type { GameState, PlayerState } from "../src/core/state.ts";
import type { TileId } from "../src/core/tile.ts";
import type { LegalAction } from "../src/strategy/legal-actions.ts";
import { evaluateCallActions } from "../src/strategy/call-evaluation.ts";

test("evaluateCallActions scores only call patterns supplied by legal actions", () => {
  const state = makeState(
    ["2m", "4m", "3m", "3m", "1p", "2p", "3p", "4p", "5p", "6p", "1s", "2s", "3s"],
    { lastDiscard: "3m", lastDiscardPlayerIndex: 3 },
  );
  const legalActions: LegalAction[] = [{
    action: { type: "chi", tiles: ["2m", "3m", "4m"], calledTile: "3m" },
    phase: "opponent_discard",
    category: "call",
  }];

  const candidates = evaluateCallActions(
    state,
    "opponent_discard",
    {
      useEvDecision: false,
      policy: {
        useTwoLayerValueForIishanten: false,
        useScoringForTenpaiValue: false,
      },
    },
    legalActions,
  );

  assert.ok(candidates.length > 0);
  assert.equal(candidates.every((candidate) => candidate.action.type === "chi"), true);
});

function makeState(hand: TileId[], options: {
  lastDiscard: TileId;
  lastDiscardPlayerIndex: number;
}): GameState {
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
    visibleTiles: createEmptyCounts34(),
    lastDiscard: { tile: options.lastDiscard, tsumogiri: false, playerIndex: options.lastDiscardPlayerIndex },
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

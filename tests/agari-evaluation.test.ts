import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyCounts34 } from "../src/core/counts.ts";
import { DEFAULT_RULE_CONFIG } from "../src/core/rules.ts";
import type { GameState, PlayerState } from "../src/core/state.ts";
import type { TileId } from "../src/core/tile.ts";
import type { LegalAction } from "../src/strategy/legal-actions.ts";
import { evaluateAgariActions } from "../src/strategy/agari-evaluation.ts";

test("evaluateAgariActions only evaluates agari actions present in legal actions", () => {
  const state = makeState(
    ["1m", "2m", "3m", "4m", "5m", "6m", "7p", "8p", "9p", "2s", "3s", "2z", "2z"],
    { lastDiscard: "4s", lastDiscardPlayerIndex: 1 },
  );
  const noRon: LegalAction[] = [{ action: { type: "pass" }, phase: "opponent_discard", category: "pass" }];
  const withRon: LegalAction[] = [
    { action: { type: "ron" }, phase: "opponent_discard", category: "agari" },
    { action: { type: "pass" }, phase: "opponent_discard", category: "pass" },
  ];

  assert.equal(evaluateAgariActions(state, "opponent_discard", noRon).length, 0);
  assert.equal(evaluateAgariActions(state, "opponent_discard", withRon)[0]?.action.type, "ron");
});

test("evaluateAgariActions blocks ron when any current wait is in self discards", () => {
  const state = makeState(
    ["2m", "3m", "1p", "2p", "3p", "1s", "2s", "3s", "7s", "8s", "9s", "5z", "5z"],
    {
      lastDiscard: "4m",
      lastDiscardPlayerIndex: 1,
      selfDiscards: ["1m"],
      riichi: true,
    },
  );
  const legalActions: LegalAction[] = [
    { action: { type: "ron" }, phase: "opponent_discard", category: "agari" },
    { action: { type: "pass" }, phase: "opponent_discard", category: "pass" },
  ];

  assert.equal(evaluateAgariActions(state, "opponent_discard", legalActions).length, 0);
});

test("evaluateAgariActions blocks ron while temporary furiten is set", () => {
  const state = makeState(
    ["1m", "2m", "3m", "4m", "5m", "6m", "7p", "8p", "9p", "2s", "3s", "2z", "2z"],
    {
      lastDiscard: "4s",
      lastDiscardPlayerIndex: 1,
      temporaryFuriten: true,
    },
  );
  const legalActions: LegalAction[] = [
    { action: { type: "ron" }, phase: "opponent_discard", category: "agari" },
    { action: { type: "pass" }, phase: "opponent_discard", category: "pass" },
  ];

  assert.equal(evaluateAgariActions(state, "opponent_discard", legalActions).length, 0);
});

test("evaluateAgariActions blocks ron while riichi furiten is set", () => {
  const state = makeState(
    ["1m", "2m", "3m", "4m", "5m", "6m", "7p", "8p", "9p", "2s", "3s", "2z", "2z"],
    {
      lastDiscard: "4s",
      lastDiscardPlayerIndex: 1,
      riichiFuriten: true,
    },
  );
  const legalActions: LegalAction[] = [
    { action: { type: "ron" }, phase: "opponent_discard", category: "agari" },
    { action: { type: "pass" }, phase: "opponent_discard", category: "pass" },
  ];

  assert.equal(evaluateAgariActions(state, "opponent_discard", legalActions).length, 0);
});

test("evaluateAgariActions scores rinshan tsumo during rinshan draw phase", () => {
  const state = makeSelfDrawState(
    ["1m", "2m", "3m", "4m", "5m", "6m", "7p", "8p", "9p", "2s", "3s", "2z", "2z"],
    "4s",
    "rinshan_draw",
  );
  state.lastKan = { type: "ankan", tile: "5z", playerIndex: 0 };
  const actions = evaluateAgariActions(state, "rinshan_draw", [
    { action: { type: "tsumo" }, phase: "rinshan_draw", category: "agari" },
  ]);

  assert.equal(actions[0]?.action.type, "tsumo");
  assert.ok(actions[0]?.reasons[0]?.message.includes("岭上开花"));
});

test("evaluateAgariActions scores chankan ron from opponent kakan", () => {
  const state = makeState(
    ["1m", "2m", "3m", "4m", "5m", "6m", "7p", "8p", "9p", "2s", "3s", "2z", "2z"],
    { lastDiscard: "1z", lastDiscardPlayerIndex: 1 },
  );
  state.phase = "chankan";
  state.lastDiscard = undefined;
  state.lastKan = { type: "kakan", tile: "4s", playerIndex: 1 };
  const actions = evaluateAgariActions(state, "chankan", [
    { action: { type: "ron" }, phase: "chankan", category: "agari" },
    { action: { type: "pass" }, phase: "chankan", category: "pass" },
  ]);

  assert.equal(actions[0]?.action.type, "ron");
  assert.ok(actions[0]?.reasons[0]?.message.includes("抢杠"));
});

function makeState(hand: TileId[], options: {
  lastDiscard: TileId;
  lastDiscardPlayerIndex: number;
  selfDiscards?: TileId[];
  riichi?: boolean;
  temporaryFuriten?: boolean;
  riichiFuriten?: boolean;
}): GameState {
  return {
    round: {
      bakaze: "1z",
      kyoku: 1,
      honba: 0,
      riichiSticks: 0,
      turn: 9,
    },
    self: {
      seatWind: "1z",
      points: 25000,
      hand,
      calls: [],
      discards: (options.selfDiscards ?? []).map((tile) => ({ tile, tsumogiri: false })),
      riichi: options.riichi ?? false,
      ippatsu: false,
      menzen: true,
    },
    opponents: [
      makeOpponent("2z"),
      makeOpponent("3z"),
      makeOpponent("4z"),
    ],
    doraIndicators: [],
    visibleTiles: createEmptyCounts34(),
    temporaryFuriten: options.temporaryFuriten,
    riichiFuriten: options.riichiFuriten,
    lastDiscard: { tile: options.lastDiscard, tsumogiri: false, playerIndex: options.lastDiscardPlayerIndex },
    rules: DEFAULT_RULE_CONFIG,
  };
}

function makeSelfDrawState(hand: TileId[], lastDraw: TileId, phase: GameState["phase"]): GameState {
  return {
    round: {
      bakaze: "1z",
      kyoku: 1,
      honba: 0,
      riichiSticks: 0,
      turn: 9,
    },
    self: {
      seatWind: "1z",
      points: 25000,
      hand,
      calls: [],
      discards: [],
      riichi: false,
      ippatsu: false,
      menzen: true,
    },
    opponents: [
      makeOpponent("2z"),
      makeOpponent("3z"),
      makeOpponent("4z"),
    ],
    doraIndicators: [],
    visibleTiles: createEmptyCounts34(),
    phase,
    lastDraw,
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

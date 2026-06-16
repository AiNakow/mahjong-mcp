import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyCounts34 } from "../src/core/counts.ts";
import { DEFAULT_RULE_CONFIG } from "../src/core/rules.ts";
import type { GameState, PlayerState } from "../src/core/state.ts";
import type { TileId } from "../src/core/tile.ts";
import { advanceToRinshanDraw, advanceToSelfDraw, applyDecisionAction } from "../src/strategy/apply-action.ts";

test("applyDecisionAction applies discard from drawn hand", () => {
  const state = makeState(["1m", "2m", "3m"], { lastDraw: "4m" });
  const result = applyDecisionAction(state, { type: "discard", tile: "4m" });

  assert.equal(result.terminal, false);
  assert.deepEqual(result.state.self.hand, ["1m", "2m", "3m"]);
  assert.equal(result.state.lastDraw, undefined);
  assert.deepEqual(result.state.lastDiscard, { tile: "4m", tsumogiri: true, playerIndex: 0 });
  assert.deepEqual(result.state.self.discards, [{ tile: "4m", tsumogiri: true }]);
});

test("applyDecisionAction applies riichi discard and riichi stick", () => {
  const state = makeState(["1m", "2m", "3m", "4m"]);
  const result = applyDecisionAction(state, { type: "riichi", tile: "4m" });

  assert.equal(result.state.self.riichi, true);
  assert.equal(result.state.self.points, 24000);
  assert.equal(result.state.round.riichiSticks, 1);
  assert.deepEqual(result.state.self.hand, ["1m", "2m", "3m"]);
});

test("applyDecisionAction applies pon with follow-up discard", () => {
  const state = makeState(
    ["5z", "5z", "1m", "2m", "3m"],
    { lastDiscard: "5z", lastDiscardPlayerIndex: 1 },
  );
  const result = applyDecisionAction(state, {
    type: "pon",
    tiles: ["5z", "5z", "5z"],
    calledTile: "5z",
    discard: "1m",
  });

  assert.equal(result.state.self.menzen, false);
  assert.deepEqual(result.state.self.calls[0], {
    type: "pon",
    tiles: ["5z", "5z", "5z"],
    calledTile: "5z",
    from: "right",
  });
  assert.deepEqual(result.state.self.hand, ["2m", "3m"]);
  assert.deepEqual(result.state.lastDiscard, { tile: "1m", tsumogiri: false, playerIndex: 0 });
});

test("applyDecisionAction enters after-call discard phase when call has no follow-up discard", () => {
  const state = makeState(
    ["4m", "5m", "1p", "2p", "3p", "6m"],
    { lastDiscard: "3m", lastDiscardPlayerIndex: 3 },
  );
  const result = applyDecisionAction(state, {
    type: "chi",
    tiles: ["3m", "4m", "5m"],
    calledTile: "3m",
  });

  assert.equal(result.state.phase, "after_call_discard");
  assert.deepEqual(result.state.self.hand, ["1p", "2p", "3p", "6m"]);
  assert.deepEqual(result.state.forbiddenDiscards, ["3m", "6m"]);
  assert.equal(result.state.lastDiscard, undefined);
});

test("applyDecisionAction rejects forbidden post-call discard", () => {
  const state = makeState(["5z", "1m"], { phase: "after_call_discard" });
  const restrictedState = { ...state, forbiddenDiscards: ["5z" as const] };

  assert.throws(
    () => applyDecisionAction(restrictedState, { type: "discard", tile: "5z" }),
    /kuikae/,
  );
});

test("applyDecisionAction marks agari actions as terminal", () => {
  const state = makeState(["1m", "2m", "3m"], { lastDraw: "4m" });
  const result = applyDecisionAction(state, { type: "tsumo" });

  assert.equal(result.terminal, true);
});

test("applyDecisionAction marks temporary furiten after passing a valid ron", () => {
  const state = makeState(
    ["1m", "2m", "3m", "4m", "5m", "6m", "7p", "8p", "9p", "2s", "3s", "2z", "2z"],
    { lastDiscard: "4s", lastDiscardPlayerIndex: 1 },
  );
  const result = applyDecisionAction(state, { type: "pass" });

  assert.equal(result.state.temporaryFuriten, true);
  assert.equal(result.state.lastDiscard, undefined);
});

test("advanceToSelfDraw clears temporary furiten", () => {
  const state = makeState(["1m", "2m", "3m"], { temporaryFuriten: true });
  const next = advanceToSelfDraw(state, "4m");

  assert.equal(next.phase, "self_draw");
  assert.equal(next.temporaryFuriten, undefined);
  assert.equal(next.lastDraw, "4m");
});

test("applyDecisionAction keeps riichi furiten after passing a valid ron during riichi", () => {
  const state = makeState(
    ["1m", "2m", "3m", "4m", "5m", "6m", "7p", "8p", "9p", "2s", "3s", "2z", "2z"],
    { lastDiscard: "4s", lastDiscardPlayerIndex: 1, riichi: true },
  );
  const result = applyDecisionAction(state, { type: "pass" });
  const next = advanceToSelfDraw(result.state, "5m");

  assert.equal(result.state.temporaryFuriten, undefined);
  assert.equal(result.state.riichiFuriten, true);
  assert.equal(next.riichiFuriten, true);
  assert.equal(next.temporaryFuriten, undefined);
});

test("applyDecisionAction upgrades pon to kakan and enters chankan window", () => {
  const state = makeState(["5z", "1m", "2m"], {});
  state.self.calls = [{ type: "pon", tiles: ["5z", "5z", "5z"], calledTile: "5z", from: "right" }];
  state.self.menzen = false;
  const result = applyDecisionAction(state, { type: "kakan", tiles: ["5z", "5z", "5z", "5z"] });

  assert.equal(result.terminal, false);
  assert.equal(result.state.phase, "chankan");
  assert.deepEqual(result.state.lastKan, { type: "kakan", tile: "5z", playerIndex: 0 });
  assert.equal(result.state.self.calls.length, 1);
  assert.equal(result.state.self.calls[0]?.type, "kakan");
  assert.deepEqual(result.state.self.hand, ["1m", "2m"]);
});

test("advanceToRinshanDraw enters rinshan draw phase after kan", () => {
  const state = makeState(["1m", "2m", "3m"]);
  state.lastKan = { type: "ankan", tile: "5z", playerIndex: 0 };
  const next = advanceToRinshanDraw(state, "4m");

  assert.equal(next.phase, "rinshan_draw");
  assert.equal(next.lastDraw, "4m");
  assert.deepEqual(next.lastKan, { type: "ankan", tile: "5z", playerIndex: 0 });
});

function makeState(hand: TileId[], options: {
  lastDraw?: TileId;
  lastDiscard?: TileId;
  lastDiscardPlayerIndex?: number;
  phase?: GameState["phase"];
  temporaryFuriten?: boolean;
  riichi?: boolean;
} = {}): GameState {
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
    phase: options.phase,
    temporaryFuriten: options.temporaryFuriten,
    lastDraw: options.lastDraw,
    lastDiscard: options.lastDiscard
      ? { tile: options.lastDiscard, tsumogiri: false, playerIndex: options.lastDiscardPlayerIndex ?? 1 }
      : undefined,
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

import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_RULE_CONFIG } from "../src/core/rules.ts";
import { createEmptyCounts34 } from "../src/core/counts.ts";
import type { GameState, PlayerState } from "../src/core/state.ts";
import type { TileId } from "../src/core/tile.ts";
import { generateLegalActions } from "../src/strategy/legal-actions.ts";

test("generateLegalActions includes self draw agari, riichi, kan and discard candidates", () => {
  const state = makeState(
    ["1m", "1m", "1m", "2m", "3m", "4m", "2p", "3p", "4p", "2s", "3s", "4s", "5s"],
    { lastDraw: "1m" },
  );
  const actions = generateLegalActions(state).map((item) => item.action.type);

  assert.ok(actions.includes("tsumo"));
  assert.ok(actions.includes("riichi"));
  assert.ok(actions.includes("ankan"));
  assert.ok(actions.includes("discard"));
});

test("generateLegalActions includes ron, pon, minkan and pass after opponent discard", () => {
  const state = makeState(
    ["1m", "1m", "1m", "2m", "3m", "4m", "2p", "3p", "4p", "2s", "3s", "4s", "5s"],
    { lastDiscard: "1m", lastDiscardPlayerIndex: 1 },
  );
  const actions = generateLegalActions(state).map((item) => item.action.type);

  assert.ok(actions.includes("ron"));
  assert.ok(actions.includes("pon"));
  assert.ok(actions.includes("minkan"));
  assert.ok(actions.includes("pass"));
});

test("generateLegalActions only allows chi from the left player", () => {
  const hand: TileId[] = ["2m", "4m", "1p", "2p", "3p", "4p", "5p", "6p", "1s", "2s", "3s", "5z", "5z"];
  const fromLeft = makeState(hand, { lastDiscard: "3m", lastDiscardPlayerIndex: 3 });
  const fromAcross = makeState(hand, { lastDiscard: "3m", lastDiscardPlayerIndex: 2 });

  assert.ok(generateLegalActions(fromLeft).some((item) => item.action.type === "chi"));
  assert.equal(generateLegalActions(fromAcross).some((item) => item.action.type === "chi"), false);
});

test("generateLegalActions suppresses calls and riichi after self riichi", () => {
  const selfDraw = makeState(
    ["1m", "1m", "1m", "2m", "3m", "4m", "2p", "3p", "4p", "2s", "3s", "4s", "5s"],
    { lastDraw: "1m", riichi: true },
  );
  const opponentDiscard = makeState(
    ["1m", "1m", "1m", "2m", "3m", "4m", "2p", "3p", "4p", "2s", "3s", "4s", "5s"],
    { lastDiscard: "1m", lastDiscardPlayerIndex: 1, riichi: true },
  );

  assert.equal(generateLegalActions(selfDraw).some((item) => item.action.type === "riichi"), false);
  assert.equal(generateLegalActions(opponentDiscard).some((item) => item.action.type === "pon"), false);
  assert.equal(generateLegalActions(opponentDiscard).some((item) => item.action.type === "minkan"), false);
  assert.ok(generateLegalActions(opponentDiscard).some((item) => item.action.type === "pass"));
});

test("generateLegalActions allows only drawn fourth-tile ankan after riichi", () => {
  const allowed = makeState(
    ["1m", "1m", "1m", "2m", "3m", "4m", "2p", "3p", "4p", "2s", "3s", "4s", "5s"],
    { lastDraw: "1m", riichi: true },
  );
  const denied = makeState(
    ["1m", "1m", "2m", "3m", "4m", "2p", "3p", "4p", "2s", "3s", "4s", "5s", "6s"],
    { lastDraw: "1m", riichi: true },
  );

  assert.ok(generateLegalActions(allowed).some((item) => item.action.type === "ankan"));
  assert.equal(generateLegalActions(denied).some((item) => item.action.type === "ankan"), false);
  assert.equal(generateLegalActions(allowed).some((item) => item.action.type === "kakan"), false);
});

test("generateLegalActions rejects post-riichi ankan when waits would change", () => {
  const state = makeState(
    ["4p", "4p", "4p", "8s", "7s", "6m", "5m", "6p", "7p", "2p", "7m", "5p", "9s"],
    { lastDraw: "4p", riichi: true },
  );

  assert.equal(generateLegalActions(state).some((item) => item.action.type === "ankan"), false);
});


test("generateLegalActions keeps riichi candidates for implicit 14-tile discard states", () => {
  const state = makeState(["1m", "2m", "3m", "1p", "2p", "3p", "1s", "2s", "3s", "4s", "5s", "6s", "7p", "7p"]);

  assert.equal(state.lastDraw, undefined);
  assert.equal(state.lastDiscard, undefined);
  assert.ok(generateLegalActions(state).some((item) => item.action.type === "riichi"));
});

test("generateLegalActions only emits discards in after-call discard phase", () => {
  const state = makeState(
    ["2m", "3m", "4m", "3p", "4p", "5p", "2s", "3s", "4s", "7m", "8m"],
    { phase: "after_call_discard" },
  );
  const actions = generateLegalActions(state);

  assert.equal(actions.length > 0, true);
  assert.equal(actions.every((item) => item.action.type === "discard"), true);
  assert.equal(actions.every((item) => item.phase === "after_call_discard"), true);
});

test("generateLegalActions filters forbidden post-call discards", () => {
  const state = makeState(
    ["1m", "6m", "7p"],
    { phase: "after_call_discard", forbiddenDiscards: ["6m"] },
  );
  const discards = generateLegalActions(state)
    .flatMap((item) => item.action.type === "discard" ? [item.action.tile] : []);

  assert.deepEqual(discards, ["1m", "7p"]);
});

test("generateLegalActions only allows ron or pass during chankan window", () => {
  const state = makeState(
    ["1m", "2m", "3m", "4m", "5m", "6m", "7p", "8p", "9p", "2s", "3s", "2z", "2z"],
    { phase: "chankan" },
  );
  state.lastKan = { type: "kakan", tile: "4s", playerIndex: 1 };
  const actions = generateLegalActions(state).map((item) => item.action.type).sort();

  assert.deepEqual(actions, ["pass", "ron"]);
});

test("generateLegalActions treats rinshan draw as self draw phase", () => {
  const state = makeState(
    ["1m", "1m", "1m", "2m", "3m", "4m", "2p", "3p", "4p", "2s", "3s", "4s", "5s"],
    { phase: "rinshan_draw", lastDraw: "1m" },
  );
  state.lastKan = { type: "ankan", tile: "1m", playerIndex: 0 };
  const actions = generateLegalActions(state).map((item) => item.action.type);

  assert.ok(actions.includes("tsumo"));
  assert.ok(actions.includes("discard"));
});

function makeState(hand: TileId[], options: {
  lastDraw?: TileId;
  lastDiscard?: TileId;
  lastDiscardPlayerIndex?: number;
  riichi?: boolean;
  phase?: GameState["phase"];
  forbiddenDiscards?: TileId[];
} = {}): GameState {
  const self: PlayerState = {
    seatWind: "1z",
    points: 25000,
    hand,
    calls: [],
    discards: [],
    riichi: options.riichi ?? false,
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
    phase: options.phase,
    forbiddenDiscards: options.forbiddenDiscards,
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

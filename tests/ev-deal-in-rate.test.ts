import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_RULE_CONFIG } from "../src/core/rules.ts";
import type { GameState, PlayerState } from "../src/core/state.ts";
import type { TileId } from "../src/core/tile.ts";
import { buildVisibleTilesFromState } from "../src/strategy/choose-action.ts";
import { estimateDangerToOpponent } from "../src/ev/deal-in-rate.ts";

test("deal-in danger orders genbutsu below suji below non-suji middle", () => {
  const state = makeState({ opponentDiscards: ["5m", "9p"] });
  const opponent = state.opponents[0];

  const genbutsu = estimateDangerToOpponent(state, opponent, "5m");
  const suji = estimateDangerToOpponent(state, opponent, "2m");
  const nonsuji = estimateDangerToOpponent(state, opponent, "5p");

  assert.ok(genbutsu < suji);
  assert.ok(suji < nonsuji);
});

test("non-suji middle danger rises when more suji groups have passed late", () => {
  const early = makeState({ opponentDiscards: ["1z"], turn: 6 });
  const late = makeState({
    opponentDiscards: ["1m", "4m", "7m", "2m", "5m", "8m", "1p", "4p", "7p", "1z"],
    turn: 14,
  });

  const earlyDanger = estimateDangerToOpponent(early, early.opponents[0], "5s");
  const lateDanger = estimateDangerToOpponent(late, late.opponents[0], "5s");

  assert.ok(lateDanger > earlyDanger);
});

function makeState(options: { opponentDiscards: TileId[]; turn?: number }): GameState {
  const self: PlayerState = {
    seatWind: "2z",
    points: 25000,
    hand: ["2m", "3m", "4m", "2p", "3p", "4p", "2s", "3s", "4s", "5m", "5m", "6p", "7p", "8p"],
    calls: [],
    discards: [],
    riichi: false,
    ippatsu: false,
    menzen: true,
  };
  const opponent = makeOpponent("1z", true, options.opponentDiscards);
  const stateWithoutVisible = {
    round: {
      bakaze: "1z" as const,
      kyoku: 1,
      honba: 0,
      riichiSticks: 0,
      turn: options.turn ?? 8,
    },
    self,
    opponents: [opponent, makeOpponent("3z", false, []), makeOpponent("4z", false, [])],
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

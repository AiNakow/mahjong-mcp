import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_RULE_CONFIG } from "../src/core/rules.ts";
import type { GameState, PlayerState } from "../src/core/state.ts";
import type { TileId } from "../src/core/tile.ts";
import { buildVisibleTilesFromState } from "../src/strategy/choose-action.ts";
import { estimateWinRateFast } from "../src/ev/win-rate.ts";
import type { DiscardCandidate } from "../src/service/analyze.ts";

test("win rate increases when effective wait count increases", () => {
  const state = makeState(["2m", "3m", "4m", "2p", "3p", "4p", "2s", "3s", "4s", "5m", "5m", "6p", "7p", "8p"]);
  const narrow = makeCandidate("8p", [{ id: "5p", remaining: 2 }]);
  const wide = makeCandidate("8p", [{ id: "5p", remaining: 4 }, { id: "8p", remaining: 4 }]);

  const narrowRate = estimateWinRateFast({ state, candidate: narrow, remainingDraws: 8, unknownWallSize: 60 });
  const wideRate = estimateWinRateFast({ state, candidate: wide, remainingDraws: 8, unknownWallSize: 60 });

  assert.ok(wideRate.value > narrowRate.value);
});

test("dora wait is discounted without changing real remaining count", () => {
  const neutralState = makeState(
    ["2m", "3m", "4m", "2p", "3p", "4p", "2s", "3s", "4s", "5m", "5m", "6p", "7p", "8p"],
  );
  const doraState = makeState(
    ["2m", "3m", "4m", "2p", "3p", "4p", "2s", "3s", "4s", "5m", "5m", "6p", "7p", "8p"],
    { doraIndicators: ["4p"] },
  );
  const candidate = makeCandidate("8p", [{ id: "5p", remaining: 4 }]);

  const neutral = estimateWinRateFast({ state: neutralState, candidate, remainingDraws: 8, unknownWallSize: 60 });
  const dora = estimateWinRateFast({ state: doraState, candidate, remainingDraws: 8, unknownWallSize: 60 });

  assert.ok(dora.value < neutral.value);
});

function makeCandidate(discard: TileId, waits: Array<{ id: TileId; remaining: number }>): DiscardCandidate {
  return {
    discard,
    shanten: 0,
    waits,
    totalWaits: waits.reduce((total, wait) => total + wait.remaining, 0),
    goodShapeCount: 0,
    goodShapeDraws: [],
  };
}

function makeState(hand: TileId[], options: { doraIndicators?: TileId[] } = {}): GameState {
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
  const stateWithoutVisible = {
    round: {
      bakaze: "1z" as const,
      kyoku: 1,
      honba: 0,
      riichiSticks: 0,
      turn: 8,
    },
    self,
    opponents: [makeOpponent("2z"), makeOpponent("3z"), makeOpponent("4z")],
    doraIndicators: options.doraIndicators ?? [],
    rules: DEFAULT_RULE_CONFIG,
  };
  return {
    ...stateWithoutVisible,
    visibleTiles: buildVisibleTilesFromState(stateWithoutVisible),
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

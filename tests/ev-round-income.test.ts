import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_RULE_CONFIG } from "../src/core/rules.ts";
import type { GameState, PlayerState } from "../src/core/state.ts";
import type { TileId } from "../src/core/tile.ts";
import { buildVisibleTilesFromState } from "../src/strategy/choose-action.ts";
import { estimateRound } from "../src/ev/estimate-round.ts";
import type { DiscardCandidate } from "../src/service/analyze.ts";

test("mangan-like hand can have lower round income under high deal-in pressure", () => {
  const safeState = makeState({ doraIndicators: ["1z"] });
  const riskyState = makeState({
    doraIndicators: ["4m", "4p", "4s"],
    opponentRiichi: true,
    opponentDiscards: ["1z"],
    turn: 14,
  });
  const safeCandidate = makeCandidate("1z", [{ id: "5p", remaining: 4 }]);
  const riskyCandidate = makeCandidate("5m", [{ id: "5p", remaining: 4 }]);

  const safe = estimateRound({
    state: safeState,
    action: { type: "discard", tile: "1z" },
    candidate: safeCandidate,
  });
  const risky = estimateRound({
    state: riskyState,
    action: { type: "discard", tile: "5m" },
    candidate: riskyCandidate,
  });

  assert.ok(risky.expectedAgariPoints.value > safe.expectedAgariPoints.value);
  assert.ok(risky.dealInRate.value > safe.dealInRate.value);
  assert.ok(risky.expectedRoundIncome.value < safe.expectedRoundIncome.value);
});

test("riichi discard pays declaration stick and recovers it on win probability", () => {
  const state = makeState();
  const candidate = makeCandidate("8p", [{ id: "5p", remaining: 4 }, { id: "8p", remaining: 4 }]);

  const estimate = estimateRound({
    state,
    action: { type: "riichi-discard", tile: "8p" },
    candidate,
  });

  assert.ok(estimate.breakdown.riichiStick < 0);
  assert.ok(estimate.breakdown.riichiStick > -1000);
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

function makeState(options: {
  doraIndicators?: TileId[];
  opponentRiichi?: boolean;
  opponentDiscards?: TileId[];
  riichiSticks?: number;
  turn?: number;
} = {}): GameState {
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
  const stateWithoutVisible = {
    round: {
      bakaze: "1z" as const,
      kyoku: 1,
      honba: 0,
      riichiSticks: options.riichiSticks ?? 0,
      turn: options.turn ?? 8,
    },
    self,
    opponents: [
      makeOpponent("1z", options.opponentRiichi ?? false, options.opponentDiscards ?? []),
      makeOpponent("3z", false, []),
      makeOpponent("4z", false, []),
    ],
    doraIndicators: options.doraIndicators ?? [],
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

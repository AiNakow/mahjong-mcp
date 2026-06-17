import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RULE_CONFIG } from "../src/core/rules.ts";
import { tilesToCounts34 } from "../src/core/counts.ts";
import type { GameState, PlayerState } from "../src/core/state.ts";
import {
  analyzeHandRequest,
  analyzeNanikiruRequest,
  chooseActionRequest,
  parseScreenshotRequest,
  scoreHandRequest,
} from "../src/service/facade.ts";

test("facade analyzes hand through ServiceResult", () => {
  const result = analyzeHandRequest({ text: "123m456p789s1z" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.kind, "draw");
    assert.equal(result.meta.source, "library");
  }
});

test("facade returns nanikiru recommendation with compact default output", () => {
  const result = analyzeNanikiruRequest({ text: "3456m3455p123788s" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.data.recommendation);
    assert.equal(result.data.candidates, undefined);
  }
});

test("facade scores a valid winning hand", () => {
  const result = scoreHandRequest({
    text: "123m456m789p234s22z",
    winningTile: "4s",
    method: "ron",
    riichi: true,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.status, "scored");
    assert.ok(result.data.best);
  }
});

test("facade chooses action from GameState and trims default response", () => {
  const state = makeState();
  const result = chooseActionRequest({ state, options: { useEvDecision: false } });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.data.action);
    assert.equal(result.data.candidates, undefined);
    assert.equal(result.data.analysis, undefined);
  }
});

test("facade maps invalid request to stable error", () => {
  const result = analyzeHandRequest({ text: "" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "invalid_input");
  }
});

test("screenshot facade is explicitly not implemented", () => {
  const result = parseScreenshotRequest({ layoutHint: "majsoul" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "not_implemented");
  }
});

function makeState(): GameState {
  const hand = ["3m", "4m", "5m", "3p", "5p", "1s", "3s", "7s", "8s", "9s", "1z", "2z", "3z"] as const;
  const self: PlayerState = {
    seatWind: "1z",
    points: 25000,
    hand: [...hand],
    calls: [],
    discards: [],
    riichi: false,
    ippatsu: false,
    menzen: true,
  };
  const opponents: PlayerState[] = ["2z", "3z", "4z"].map((seatWind) => ({
    seatWind: seatWind as PlayerState["seatWind"],
    points: 25000,
    calls: [],
    discards: [],
    riichi: false,
    ippatsu: false,
    menzen: true,
  }));
  return {
    phase: "self_draw",
    round: {
      bakaze: "1z",
      kyoku: 1,
      honba: 0,
      riichiSticks: 0,
      turn: 8,
    },
    self,
    opponents,
    doraIndicators: [],
    visibleTiles: tilesToCounts34([...hand, "5p"]),
    lastDraw: "5p",
    rules: DEFAULT_RULE_CONFIG,
  };
}


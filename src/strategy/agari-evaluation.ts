import type { GameState } from "../core/state.ts";
import type { TileId } from "../core/tile.ts";
import { calculateAgariScore, type AgariScoreResult, type ScoreCandidate } from "../scoring/index.ts";
import type { DecisionPhase, EvaluatedAction } from "./action-types.ts";
import type { Reason } from "./reason.ts";

export function evaluateAgariActions(state: GameState, phase: DecisionPhase): EvaluatedAction[] {
  if (phase === "self_draw") {
    return evaluateTsumoAction(state, phase);
  }
  if (phase === "opponent_discard") {
    return evaluateRonAction(state, phase);
  }
  return [];
}

function evaluateTsumoAction(state: GameState, phase: DecisionPhase): EvaluatedAction[] {
  if (!state.lastDraw) {
    return [];
  }
  const result = calculateAgariScore({
    hand: getSelfAgariHand(state, state.lastDraw),
    winningTile: state.lastDraw,
    method: "tsumo",
    calls: state.self.calls,
    seatWind: state.self.seatWind,
    bakaze: state.round.bakaze,
    honba: state.round.honba,
    riichiSticks: state.round.riichiSticks,
    rules: state.rules,
    riichi: state.self.riichi,
    ippatsu: state.self.ippatsu,
    doraIndicators: state.doraIndicators,
  });
  if (result.status !== "scored" || !result.best) {
    return [];
  }
  return [scoreAgariAction({ type: "tsumo" }, phase, result, result.best)];
}

function evaluateRonAction(state: GameState, phase: DecisionPhase): EvaluatedAction[] {
  const discard = state.lastDiscard;
  if (!discard || discard.playerIndex === 0 || isBasicFuriten(state, discard.tile)) {
    return [];
  }
  const result = calculateAgariScore({
    hand: getSelfAgariHand(state, discard.tile),
    winningTile: discard.tile,
    method: "ron",
    calls: state.self.calls,
    seatWind: state.self.seatWind,
    bakaze: state.round.bakaze,
    honba: state.round.honba,
    riichiSticks: state.round.riichiSticks,
    rules: state.rules,
    riichi: state.self.riichi,
    ippatsu: state.self.ippatsu,
    houtei: state.round.turn >= 18,
    doraIndicators: state.doraIndicators,
  });
  if (result.status !== "scored" || !result.best) {
    return [];
  }
  return [scoreAgariAction({ type: "ron" }, phase, result, result.best)];
}

function scoreAgariAction(
  action: EvaluatedAction["action"],
  phase: DecisionPhase,
  result: AgariScoreResult,
  best: ScoreCandidate,
): EvaluatedAction {
  const points = best.points.total;
  const yakuText = best.yaku.map((item) => item.name).join("、");
  const reasons: Reason[] = [{
    type: "agari",
    polarity: "positive",
    priority: 100,
    message: `${action.type === "tsumo" ? "自摸" : "荣和"}成立：${yakuText}，${best.han} 番 ${best.fu} 符，点数 ${points}。`,
    data: {
      action: action.type,
      han: best.han,
      fu: best.fu,
      points,
      yaku: best.yaku.map((item) => item.id),
    },
  }];
  return {
    action,
    phase,
    legal: true,
    score: points / 10,
    priority: 100,
    category: "agari",
    scoreBreakdown: {
      agari: points / 10,
    },
    reasons,
    warnings: [],
    source: result,
  };
}

function getSelfAgariHand(state: GameState, winningTile: TileId): TileId[] {
  const hand = [...(state.self.hand ?? [])];
  return hand.includes(winningTile) && hand.length % 3 === 2
    ? hand
    : [...hand, winningTile];
}

function isBasicFuriten(state: GameState, tile: TileId): boolean {
  return state.self.discards.some((discard) => discard.tile === tile);
}

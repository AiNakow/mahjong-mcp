import type { GameState } from "../core/state.ts";
import type { TileId } from "../core/tile.ts";
import { calculateAgariScore, type AgariScoreResult, type ScoreCandidate } from "../scoring/index.ts";
import { analyzeHandText } from "../service/analyze.ts";
import type { DecisionPhase, EvaluatedAction } from "./action-types.ts";
import type { LegalAction } from "./legal-actions.ts";
import type { Reason } from "./reason.ts";

export function evaluateAgariActions(
  state: GameState,
  phase: DecisionPhase,
  legalActions?: readonly LegalAction[],
): EvaluatedAction[] {
  if ((phase === "self_draw" || phase === "rinshan_draw") && hasLegalAction(legalActions, "tsumo")) {
    return evaluateTsumoAction(state, phase);
  }
  if ((phase === "opponent_discard" || phase === "chankan") && hasLegalAction(legalActions, "ron")) {
    return evaluateRonAction(state, phase);
  }
  return [];
}

function hasLegalAction(
  legalActions: readonly LegalAction[] | undefined,
  type: "tsumo" | "ron",
): boolean {
  return legalActions
    ? legalActions.some((item) => item.action.type === type)
    : true;
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
    rinshan: phase === "rinshan_draw",
    doraIndicators: state.doraIndicators,
  });
  if (result.status !== "scored" || !result.best) {
    return [];
  }
  return [scoreAgariAction({ type: "tsumo" }, phase, result, result.best)];
}

function evaluateRonAction(state: GameState, phase: DecisionPhase): EvaluatedAction[] {
  const discard = state.lastDiscard;
  const chankanTile = phase === "chankan" ? state.lastKan?.tile : undefined;
  if (
    (!discard && !chankanTile)
    || (discard?.playerIndex === 0)
    || (phase === "chankan" && state.lastKan?.playerIndex === 0)
    || state.temporaryFuriten
    || state.riichiFuriten
    || isBasicFuriten(state, chankanTile ?? discard!.tile)
  ) {
    return [];
  }
  const winningTile = chankanTile ?? discard!.tile;
  const result = calculateAgariScore({
    hand: getSelfAgariHand(state, winningTile),
    winningTile,
    method: "ron",
    calls: state.self.calls,
    seatWind: state.self.seatWind,
    bakaze: state.round.bakaze,
    honba: state.round.honba,
    riichiSticks: state.round.riichiSticks,
    rules: state.rules,
    riichi: state.self.riichi,
    ippatsu: state.self.ippatsu,
    chankan: phase === "chankan",
    houtei: phase !== "chankan" && state.round.turn >= 18,
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
  const selfDiscards = new Set(state.self.discards.map((discard) => discard.tile));
  if (selfDiscards.has(tile)) {
    return true;
  }
  try {
    const analysis = analyzeHandText({
      text: (state.self.hand ?? []).join(""),
      mode: hasOpenCall(state) ? 1 : 0,
      includeRaw: false,
    });
    if (analysis.kind !== "draw" || analysis.shanten !== 0) {
      return false;
    }
    return analysis.draws.some((draw) => selfDiscards.has(draw.id));
  } catch {
    return false;
  }
}

function hasOpenCall(state: GameState): boolean {
  return state.self.calls.some((call) => call.type !== "ankan");
}

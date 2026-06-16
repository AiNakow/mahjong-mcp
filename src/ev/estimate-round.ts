import { analyzeTiles } from "../hand/paili.ts";
import type { TileId } from "../core/tile.ts";
import type { DiscardCandidate } from "../service/analyze.ts";
import type { CandidateAction, EstimateRoundInput, RoundEstimate } from "./types.ts";
import { estimateDealInRateFast } from "./deal-in-rate.ts";
import { estimateHandValueFast } from "./hand-value.ts";
import { estimateOpponentsFast } from "./opponent-model.ts";
import { estimateRoundIncome } from "./round-income.ts";
import { estimateWinRateFast } from "./win-rate.ts";
import { estimateRemainingOwnDraws, estimateUnknownWallSize } from "./wall-model.ts";
import type { ProbabilityEstimate } from "./types.ts";

export function estimateRound(input: EstimateRoundInput): RoundEstimate {
  if (input.mode === "deep") {
    throw new Error("deep 模式尚未实现；当前只支持 fast/balanced 确定性估算。");
  }
  const discardTile = getDiscardTile(input.action);
  const candidate = input.candidate ?? (discardTile ? findOrBuildCandidate(input) : buildKanCandidate(input));
  const remainingDraws = input.assumptions?.remainingDraws ?? estimateRemainingOwnDraws(input.state);
  const unknownWallSize = input.assumptions?.unknownWallSize ?? estimateUnknownWallSize(input.state);
  const winRate = adjustKanWinRate(estimateWinRateFast({
    state: input.state,
    candidate,
    remainingDraws,
    unknownWallSize,
  }), input.action.type);
  const dealIn = discardTile
    ? estimateDealInRateFast(input.state, discardTile, {
      shanten: candidate.shanten,
      remainingDraws,
    }).combinedPushRate
    : {
      value: input.action.type === "minkan" ? 0.012 : input.action.type === "kakan" ? 0.006 : 0,
      confidence: "low" as const,
      reasons: ["杠动作本身不切牌，快速 EV 仅计入抢杠/开新宝牌的粗略风险。"],
    };
  const handValue = estimateHandValueFast(input.state, candidate);
  const opponents = estimateOpponentsFast(input.state);
  const income = estimateRoundIncome({
    state: input.state,
    actionType: input.action.type,
    winRate,
    dealInRate: dealIn,
    handValue,
    opponents,
    isTenpai: candidate.shanten <= 0,
  });
  const warnings = [
    "快速模式为启发式估算，不等同于完整四人博弈搜索。",
    ...(candidate.shanten >= 2 ? ["二向听以上打点和和率置信度较低。"] : []),
    ...(!discardTile ? ["杠动作 EV 使用岭上补一摸和新宝牌风险近似，尚非完整杠后搜索。"] : []),
  ];

  return {
    action: input.action,
    winRate,
    dealInRate: dealIn,
    expectedAgariPoints: income.expectedAgariPoints,
    expectedRoundIncome: income.expectedRoundIncome,
    breakdown: income.breakdown,
    confidence: candidate.shanten <= 1 ? "medium" : "low",
    assumptions: [
      `剩余自摸巡数 ${remainingDraws}。`,
      `未知牌山规模 ${unknownWallSize}。`,
      "他家手牌不可见，速度和打点使用规则表估算。",
    ],
    warnings,
  };
}

function findOrBuildCandidate(input: EstimateRoundInput): DiscardCandidate {
  const discardTile = getDiscardTile(input.action);
  if (!discardTile) {
    return buildKanCandidate(input);
  }
  const matched = input.candidates?.find((candidate) => candidate.discard === discardTile);
  if (matched) {
    return matched;
  }
  const hand = [...(input.state.self.hand ?? []), ...(input.state.lastDraw ? [input.state.lastDraw] : [])];
  const discardIndex = hand.indexOf(discardTile);
  if (discardIndex < 0) {
    throw new Error(`行动 ${discardTile} 不在自家手牌中。`);
  }
  hand.splice(discardIndex, 1);
  const analysis = analyzeTiles(hand, input.state.self.calls.some((call) => call.type !== "ankan") ? 1 : 0, {
    unavailableTiles: [
      ...input.state.doraIndicators,
      ...input.state.self.calls.flatMap((call) => call.tiles),
      ...input.state.opponents.flatMap((opponent) => [
        ...opponent.calls.flatMap((call) => call.tiles),
        ...opponent.discards.map((discard) => discard.tile),
      ]),
    ],
  });
  return {
    discard: discardTile,
    shanten: analysis.shanten,
    waits: analysis.draws,
    totalWaits: analysis.total_draws,
    goodShapeCount: analysis.good_shape_count,
    goodShapeDraws: analysis.good_shape_draws,
  };
}

function buildKanCandidate(input: EstimateRoundInput): DiscardCandidate {
  const hand = [...(input.state.self.hand ?? []), ...(input.state.lastDraw ? [input.state.lastDraw] : [])];
  const analysis = analyzeTiles(hand, input.state.self.calls.some((call) => call.type !== "ankan") ? 1 : 0, {
    unavailableTiles: [
      ...input.state.doraIndicators,
      ...input.state.self.calls.flatMap((call) => call.tiles),
      ...input.state.opponents.flatMap((opponent) => [
        ...opponent.calls.flatMap((call) => call.tiles),
        ...opponent.discards.map((discard) => discard.tile),
      ]),
    ],
  });
  const waits = analysis.draws;
  if (!("tiles" in input.action)) {
    throw new Error("杠动作缺少 tiles。");
  }
  const tile = input.action.tiles[0];
  return {
    discard: tile,
    shanten: analysis.shanten,
    waits,
    totalWaits: analysis.total_draws,
    goodShapeCount: analysis.good_shape_count,
    goodShapeDraws: analysis.good_shape_draws,
  };
}

function adjustKanWinRate(estimate: ProbabilityEstimate, actionType: CandidateAction["type"]): ProbabilityEstimate {
  if (actionType !== "ankan" && actionType !== "kakan" && actionType !== "minkan") {
    return estimate;
  }
  return {
    ...estimate,
    value: Math.min(0.95, estimate.value * 1.08 + 0.006),
    confidence: estimate.confidence === "high" ? "medium" : estimate.confidence,
    reasons: [
      ...estimate.reasons,
      "杠后可获得岭上补一摸，快速估算小幅上调自家和牌率。",
    ],
  };
}

function getDiscardTile(action: CandidateAction): TileId | undefined {
  return "tile" in action ? action.tile : undefined;
}

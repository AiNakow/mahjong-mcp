import { analyzeTiles } from "../hand/paili.ts";
import type { DiscardCandidate } from "../service/analyze.ts";
import type { EstimateRoundInput, RoundEstimate } from "./types.ts";
import { estimateDealInRateFast } from "./deal-in-rate.ts";
import { estimateHandValueFast } from "./hand-value.ts";
import { estimateOpponentsFast } from "./opponent-model.ts";
import { estimateRoundIncome } from "./round-income.ts";
import { estimateWinRateFast } from "./win-rate.ts";
import { estimateRemainingOwnDraws, estimateUnknownWallSize } from "./wall-model.ts";

export function estimateRound(input: EstimateRoundInput): RoundEstimate {
  if (input.mode === "deep") {
    throw new Error("deep 模式尚未实现；当前只支持 fast/balanced 确定性估算。");
  }

  const candidate = input.candidate ?? findOrBuildCandidate(input);
  const remainingDraws = input.assumptions?.remainingDraws ?? estimateRemainingOwnDraws(input.state);
  const unknownWallSize = input.assumptions?.unknownWallSize ?? estimateUnknownWallSize(input.state);
  const winRate = estimateWinRateFast({
    state: input.state,
    candidate,
    remainingDraws,
    unknownWallSize,
  });
  const dealIn = estimateDealInRateFast(input.state, input.action.tile, {
    shanten: candidate.shanten,
    remainingDraws,
  });
  const handValue = estimateHandValueFast(input.state, candidate);
  const opponents = estimateOpponentsFast(input.state);
  const income = estimateRoundIncome({
    state: input.state,
    actionType: input.action.type,
    winRate,
    dealInRate: dealIn.combinedPushRate,
    handValue,
    opponents,
    isTenpai: candidate.shanten <= 0,
  });
  const warnings = [
    "快速模式为启发式估算，不等同于完整四人博弈搜索。",
    ...(candidate.shanten >= 2 ? ["二向听以上打点和和率置信度较低。"] : []),
  ];

  return {
    action: input.action,
    winRate,
    dealInRate: dealIn.combinedPushRate,
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
  const matched = input.candidates?.find((candidate) => candidate.discard === input.action.tile);
  if (matched) {
    return matched;
  }
  const hand = [...(input.state.self.hand ?? []), ...(input.state.lastDraw ? [input.state.lastDraw] : [])];
  const discardIndex = hand.indexOf(input.action.tile);
  if (discardIndex < 0) {
    throw new Error(`行动 ${input.action.tile} 不在自家手牌中。`);
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
    discard: input.action.tile,
    shanten: analysis.shanten,
    waits: analysis.draws,
    totalWaits: analysis.total_draws,
    goodShapeCount: analysis.good_shape_count,
    goodShapeDraws: analysis.good_shape_draws,
  };
}

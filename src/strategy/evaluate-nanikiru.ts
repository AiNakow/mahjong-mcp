import type { TileId } from "../core/tile.ts";
import type { TileInfo } from "../hand/paili.ts";
import type { DiscardAnalysis, DiscardCandidate } from "../service/analyze.ts";
import type { RoundEstimate } from "../ev/index.ts";
import { evaluateShape } from "./evaluators/evaluate-shape.ts";
import { evaluateValuePotential } from "./evaluators/evaluate-value.ts";
import { evaluateRouteCoherence } from "./evaluators/evaluate-route.ts";
import { evaluateDefense } from "./evaluators/evaluate-defense.ts";
import { buildCandidateFeature } from "./features.ts";
import { evaluateSameShantenImprovement } from "./improvement.ts";
import { evaluateRoutePortfolio } from "./routes.ts";
import type { NanikiruPolicy } from "./nanikiru-policy.ts";
import { DEFAULT_NANIKIRU_POLICY, normalizeStrategyPolicy } from "./nanikiru-policy.ts";
import type { NanikiruContext } from "./nanikiru-context.ts";
import type { Reason } from "./reason.ts";
import { orderNanikiruCandidates } from "./arbitration.ts";

export interface NanikiruScoreBreakdown {
  shanten: number;
  ukeire: number;
  goodShape: number;
  shape: number;
  route: number;
  value: number;
  improvement: number;
  defense: number;
  ev: number;
}

export interface EvaluatedNanikiruCandidate extends DiscardCandidate {
  score: number;
  scoreBreakdown: NanikiruScoreBreakdown;
  reasons: Reason[];
  estimate?: RoundEstimate;
}

export interface EvaluatedNanikiruAnalysis {
  input: string;
  handText: string;
  hand: TileId[];
  tileCount: number;
  shanten: number;
  isTenpai: boolean;
  isAgari: boolean;
  candidates: EvaluatedNanikiruCandidate[];
  recommendation?: TileId;
  raw?: DiscardAnalysis["raw"];
}

export function evaluateNanikiru(
  analysis: DiscardAnalysis,
  policy: Partial<NanikiruPolicy> = DEFAULT_NANIKIRU_POLICY,
  context: NanikiruContext = {},
): EvaluatedNanikiruAnalysis {
  const normalizedPolicy = normalizeStrategyPolicy(policy);
  const evaluated = analysis.candidates
    .map((candidate) => evaluateCandidate(analysis, candidate, normalizedPolicy, context));
  const ordered = orderNanikiruCandidates(evaluated, analysis, normalizedPolicy, context, {
    isEarlyLowValueTenpaiImprovement,
  });

  return {
    input: analysis.input,
    handText: analysis.handText,
    hand: analysis.hand,
    tileCount: analysis.tileCount,
    shanten: analysis.shanten,
    isTenpai: analysis.isTenpai,
    isAgari: analysis.isAgari,
    candidates: ordered,
    recommendation: ordered[0]?.discard,
    raw: analysis.raw,
  };
}

function evaluateCandidate(
  analysis: DiscardAnalysis,
  candidate: DiscardCandidate,
  policy: NanikiruPolicy,
  context: NanikiruContext,
): EvaluatedNanikiruCandidate {
  const afterDiscard = removeOneTile(analysis.hand, candidate.discard);
  const feature = buildCandidateFeature(analysis.hand, afterDiscard, candidate, context);
  const beforeFeature = buildCandidateFeature(analysis.hand, analysis.hand, candidate, context);
  const beforeRoutePortfolio = evaluateRoutePortfolio(beforeFeature, policy, context);
  const routePortfolio = evaluateRoutePortfolio(feature, policy, context);
  const reasons: Reason[] = [];
  const isShantenBack = candidate.shanten > analysis.shanten;
  const improvementOverride = isEarlyLowValueTenpaiImprovement(analysis, candidate, policy, context);

  const shantenMultiplier = improvementOverride ? policy.shantenBackImprovementShantenMultiplier : 1;
  const shantenScore = -candidate.shanten * policy.shantenWeight * shantenMultiplier;
  reasons.push({
    type: "shanten",
    polarity: candidate.shanten <= analysis.shanten ? "neutral" : "negative",
    priority: 70,
    message: `切 ${candidate.discard} 后为 ${formatShanten(candidate.shanten)}。`,
    data: { discard: candidate.discard, shanten: candidate.shanten, multiplier: shantenMultiplier },
  });

  const ukeireMultiplier = improvementOverride
    ? policy.shantenBackImprovementUkeireMultiplier
    : isShantenBack
      ? policy.shantenBackUkeireMultiplier
      : 1;
  const ukeireScore = candidate.totalWaits * policy.ukeireWeight * ukeireMultiplier;
  const shouldEvaluateGoodShape = candidate.shanten <= 1;
  const goodShapeRatio = candidate.totalWaits > 0
    ? candidate.goodShapeCount / candidate.totalWaits
    : 0;
  reasons.push({
    type: "ukeire",
    polarity: isShantenBack ? "neutral" : "positive",
    priority: 90,
    message: formatUkeireReasonMessage(candidate, {
      improvementOverride,
      isShantenBack,
      shouldEvaluateGoodShape,
      goodShapeRatio,
    }),
    data: {
      discard: candidate.discard,
      totalWaits: candidate.totalWaits,
      ...(shouldEvaluateGoodShape ? {
        goodShapeCount: candidate.goodShapeCount,
        goodShapeDraws: candidate.goodShapeDraws,
        goodShapeRatio,
      } : {}),
      shantenBack: isShantenBack,
      ukeireMultiplier,
    },
  });

  const goodShapeMultiplier = improvementOverride
      ? policy.shantenBackImprovementGoodShapeMultiplier
      : isShantenBack
      ? policy.shantenBackGoodShapeMultiplier
      : 1;
  const goodShapeScore = shouldEvaluateGoodShape
    ? candidate.goodShapeCount * policy.goodShapeWeight * goodShapeMultiplier
    : 0;

  if (improvementOverride) {
    reasons.push({
      type: "ukeire",
      polarity: "positive",
      priority: 92,
      message: "早巡低价值窄听时，优先保留宝牌进张和役种延展的高质量改良。",
      data: {
        discard: candidate.discard,
        turn: context.turn,
        totalWaits: candidate.totalWaits,
        goodShapeCount: candidate.goodShapeCount,
        doraDraws: getDoraDraws(candidate, context),
      },
    });
  }

  const shapeEvaluation = evaluateShape(afterDiscard, candidate, context);
  const routeEvaluation = evaluateRouteCoherence(beforeFeature, feature, policy, context, {
    before: beforeRoutePortfolio,
    after: routePortfolio,
  });
  const valueEvaluation = evaluateValuePotential(afterDiscard, candidate.discard, policy, {
    shanten: candidate.shanten,
    waits: candidate.waits,
    context,
    feature,
    routePortfolio,
  });
  const improvementEvaluation = evaluateSameShantenImprovement(feature, policy, context);
  const defenseEvaluation = evaluateDefense(candidate.discard, context, afterDiscard);

  const scoreBreakdown: NanikiruScoreBreakdown = {
    shanten: shantenScore,
    ukeire: ukeireScore,
    goodShape: goodShapeScore,
    shape: shapeEvaluation.score * policy.shapeWeight,
    route: routeEvaluation.score * policy.routeWeight,
    value: valueEvaluation.score * policy.valueWeight,
    improvement: improvementEvaluation.score,
    defense: defenseEvaluation.score * policy.defenseWeight,
    ev: 0,
  };

  const score = Object.values(scoreBreakdown).reduce((total, value) => total + value, 0);

  return {
    ...candidate,
    score,
    scoreBreakdown,
    reasons: [
      ...reasons,
      ...shapeEvaluation.reasons,
      ...routeEvaluation.reasons,
      ...valueEvaluation.reasons,
      ...improvementEvaluation.reasons,
      ...defenseEvaluation.reasons,
    ],
  };
}

function formatUkeireReasonMessage(
  candidate: DiscardCandidate,
  options: {
    improvementOverride: boolean;
    isShantenBack: boolean;
    goodShapeRatio: number;
    shouldEvaluateGoodShape: boolean;
  },
): string {
  const goodShapeSummary = options.shouldEvaluateGoodShape
    ? `，其中好形相关进张 ${candidate.goodShapeCount} 枚，好形率 ${formatPercent(options.goodShapeRatio)}`
    : "";
  if (options.improvementOverride) {
    return `当前低价值窄听，切 ${candidate.discard} 退向后的 ${candidate.totalWaits} 枚进张按早巡改良价值折算${goodShapeSummary}。`;
  }
  if (options.isShantenBack) {
    return `切 ${candidate.discard} 会退向，${candidate.totalWaits} 枚进张按改良价值折算${goodShapeSummary}。`;
  }
  return `切 ${candidate.discard} 后总进张 ${candidate.totalWaits} 枚${goodShapeSummary}。`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function isEarlyLowValueTenpaiImprovement(
  analysis: DiscardAnalysis,
  candidate: DiscardCandidate,
  policy: NanikiruPolicy,
  context: NanikiruContext,
): boolean {
  return analysis.shanten === 0
    && candidate.shanten === 1
    && (context.turn ?? 99) <= policy.earlyLowValueTenpaiTurnMax
    && !hasActiveThreat(context)
    && isLowValueNarrowTenpai(analysis, policy, context)
    && candidate.totalWaits >= policy.shantenBackImprovementMinWaits
    && candidate.goodShapeCount >= policy.shantenBackImprovementMinGoodShape
    && hasImprovementRoute(candidate, context);
}

function isLowValueNarrowTenpai(
  analysis: DiscardAnalysis,
  policy: NanikiruPolicy,
  context: NanikiruContext,
): boolean {
  const tenpaiCandidates = analysis.candidates.filter((candidate) => candidate.shanten <= analysis.shanten);
  if (tenpaiCandidates.length === 0) {
    return false;
  }

  const bestWaits = Math.max(...tenpaiCandidates.map((candidate) => candidate.totalWaits));
  if (bestWaits > policy.lowValueTenpaiWaitsMax) {
    return false;
  }

  return tenpaiCandidates.every((candidate) => (
    countActualDora(removeOneTile(analysis.hand, candidate.discard), context) === 0
  ));
}

function hasActiveThreat(context: NanikiruContext): boolean {
  return (context.opponents ?? []).some((opponent) => opponent.riichi || opponent.ippatsu);
}

function hasImprovementRoute(candidate: DiscardCandidate, context: NanikiruContext): boolean {
  if ((context.doraIndicators ?? []).length > 0) {
    return getDoraDraws(candidate, context).length > 0;
  }
  return getDoraDraws(candidate, context).length > 0
    || candidate.goodShapeCount >= candidate.totalWaits * 0.5;
}

function getDoraDraws(candidate: DiscardCandidate, context: NanikiruContext): TileId[] {
  const doraTiles = (context.doraIndicators ?? []).map(nextDoraTile);
  if (doraTiles.length === 0) {
    return [];
  }
  return candidate.waits
    .filter((wait) => doraTiles.includes(wait.id))
    .map((wait) => wait.id);
}

function countActualDora(tiles: readonly TileId[], context: NanikiruContext): number {
  const doraTiles = (context.doraIndicators ?? []).map(nextDoraTile);
  return tiles.filter((tile) => doraTiles.includes(tile)).length + (context.akaDoraCount ?? 0);
}

function nextDoraTile(indicator: TileId): TileId {
  const suit = indicator[1];
  const rank = Number(indicator[0]);
  if (suit === "z") {
    if (rank >= 1 && rank <= 4) {
      return `${rank === 4 ? 1 : rank + 1}z` as TileId;
    }
    return ({ 5: "6z", 6: "7z", 7: "5z" } as Record<number, TileId>)[rank];
  }
  const nextRank = rank === 9 ? 1 : rank + 1;
  return `${nextRank}${suit}` as TileId;
}

function removeOneTile(tiles: readonly TileId[], tile: TileId): TileId[] {
  const result = [...tiles];
  const index = result.indexOf(tile);
  if (index >= 0) {
    result.splice(index, 1);
  }
  return result;
}

function formatShanten(shanten: number): string {
  if (shanten < 0) {
    return "已和牌";
  }
  if (shanten === 0) {
    return "听牌";
  }
  return `${shanten} 向听`;
}

export function formatWaits(waits: readonly TileInfo[]): string {
  return waits.map((wait) => `${wait.id}(${wait.remaining})`).join("、");
}

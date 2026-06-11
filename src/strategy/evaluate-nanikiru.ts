import type { TileId } from "../core/tile.ts";
import type { TileInfo } from "../hand/paili.ts";
import { analyzeTiles } from "../hand/paili.ts";
import type { DiscardAnalysis, DiscardCandidate } from "../service/analyze.ts";
import { evaluateShape } from "./evaluators/evaluate-shape.ts";
import { evaluateValuePotential } from "./evaluators/evaluate-value.ts";
import { evaluateRouteCoherence } from "./evaluators/evaluate-route.ts";
import { evaluateDefense } from "./evaluators/evaluate-defense.ts";
import type { NanikiruPolicy } from "./nanikiru-policy.ts";
import { DEFAULT_NANIKIRU_POLICY } from "./nanikiru-policy.ts";
import type { NanikiruContext } from "./nanikiru-context.ts";
import type { Reason } from "./reason.ts";

export interface NanikiruScoreBreakdown {
  shanten: number;
  ukeire: number;
  goodShape: number;
  shape: number;
  route: number;
  value: number;
  defense: number;
}

export interface EvaluatedNanikiruCandidate extends DiscardCandidate {
  score: number;
  scoreBreakdown: NanikiruScoreBreakdown;
  reasons: Reason[];
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
  policy: NanikiruPolicy = DEFAULT_NANIKIRU_POLICY,
  context: NanikiruContext = {},
): EvaluatedNanikiruAnalysis {
  const evaluated = analysis.candidates
    .map((candidate) => evaluateCandidate(analysis, candidate, policy, context))
    .sort((a, b) => compareCandidatesForRecommendation(a, b, analysis.hand));

  const ordered = orderRecommendationCandidates(evaluated, analysis, policy, context);

  addComparativeReasons(ordered, analysis.hand);

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
  reasons.push({
    type: "ukeire",
    polarity: isShantenBack ? "neutral" : "positive",
    priority: 90,
    message: improvementOverride
      ? `当前低价值窄听，切 ${candidate.discard} 退向后的 ${candidate.totalWaits} 枚进张按早巡改良价值折算。`
      : isShantenBack
      ? `切 ${candidate.discard} 会退向，${candidate.totalWaits} 枚进张按改良价值折算。`
      : `切 ${candidate.discard} 后总进张 ${candidate.totalWaits} 枚。`,
    data: {
      discard: candidate.discard,
      totalWaits: candidate.totalWaits,
      shantenBack: isShantenBack,
      multiplier: ukeireMultiplier,
    },
  });

  const goodShapeMultiplier = improvementOverride
    ? policy.shantenBackImprovementGoodShapeMultiplier
    : isShantenBack
      ? policy.shantenBackGoodShapeMultiplier
      : 1;
  const goodShapeScore = candidate.goodShapeCount * policy.goodShapeWeight * goodShapeMultiplier;
  if (candidate.goodShapeCount > 0) {
    reasons.push({
      type: "good_shape",
      polarity: isShantenBack ? "neutral" : "positive",
      priority: 75,
      message: improvementOverride
        ? `退向后好形相关进张 ${candidate.goodShapeCount} 枚，早巡改良价值较高。`
        : isShantenBack
        ? `退向后的好形相关进张 ${candidate.goodShapeCount} 枚，按改良价值折算。`
        : `其中好形相关进张 ${candidate.goodShapeCount} 枚。`,
      data: {
        discard: candidate.discard,
        goodShapeCount: candidate.goodShapeCount,
        goodShapeDraws: candidate.goodShapeDraws,
        shantenBack: isShantenBack,
        multiplier: goodShapeMultiplier,
      },
    });
  }

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

  const shapeEvaluation = evaluateShape(afterDiscard, candidate);
  const routeEvaluation = evaluateRouteCoherence(analysis.hand, afterDiscard, candidate.discard, policy, context);
  const valueEvaluation = evaluateValuePotential(afterDiscard, candidate.discard, policy, {
    shanten: candidate.shanten,
    waits: candidate.waits,
    context,
  });
  const defenseEvaluation = evaluateDefense(candidate.discard, context, afterDiscard);

  const scoreBreakdown: NanikiruScoreBreakdown = {
    shanten: shantenScore,
    ukeire: ukeireScore,
    goodShape: goodShapeScore,
    shape: shapeEvaluation.score * policy.shapeWeight,
    route: routeEvaluation.score * policy.routeWeight,
    value: valueEvaluation.score * policy.valueWeight,
    defense: defenseEvaluation.score * policy.defenseWeight,
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
      ...defenseEvaluation.reasons,
    ],
  };
}

function compareCandidates(a: EvaluatedNanikiruCandidate, b: EvaluatedNanikiruCandidate): number {
  return b.score - a.score || b.totalWaits - a.totalWaits;
}

function compareCandidatesForRecommendation(
  a: EvaluatedNanikiruCandidate,
  b: EvaluatedNanikiruCandidate,
  hand: readonly TileId[],
): number {
  const scoreOrder = compareCandidates(a, b);
  if (scoreOrder !== 0 || a.goodShapeCount !== b.goodShapeCount) {
    return scoreOrder || b.goodShapeCount - a.goodShapeCount;
  }

  return getProactiveSafetyPressure(hand, a) - getProactiveSafetyPressure(hand, b);
}

function orderRecommendationCandidates(
  candidates: EvaluatedNanikiruCandidate[],
  analysis: DiscardAnalysis,
  policy: NanikiruPolicy,
  context: NanikiruContext,
): EvaluatedNanikiruCandidate[] {
  const nonBack = candidates.filter((candidate) => candidate.shanten <= analysis.shanten);
  if (nonBack.length === 0) {
    return candidates;
  }

  const shantenBack = candidates.filter((candidate) => candidate.shanten > analysis.shanten);
  if (shantenBack.length === 0) {
    return candidates;
  }

  const bestNonBack = nonBack[0];
  const allowedBack = shantenBack.filter((candidate) => (
    candidate.scoreBreakdown.defense >= bestNonBack.scoreBreakdown.defense + policy.shantenBackDefenseOverrideDelta
    || isEarlyLowValueTenpaiImprovement(analysis, candidate, policy, context)
  ));
  const heldBack = shantenBack.filter((candidate) => !allowedBack.includes(candidate));

  return [
    ...[...nonBack, ...allowedBack].sort((a, b) => compareCandidatesForRecommendation(a, b, analysis.hand)),
    ...heldBack.sort((a, b) => compareCandidatesForRecommendation(a, b, analysis.hand)),
  ];
}

function addComparativeReasons(candidates: EvaluatedNanikiruCandidate[], hand: readonly TileId[]): void {
  const best = candidates[0];
  const second = candidates[1];
  if (!best || !second) {
    return;
  }

  if (best.totalWaits > second.totalWaits) {
    best.reasons.push({
      type: "ukeire",
      polarity: "positive",
      priority: 95,
      message: `相比切 ${second.discard} 的 ${second.totalWaits} 枚，切 ${best.discard} 的进张更多。`,
      data: {
        discard: best.discard,
        secondDiscard: second.discard,
        totalWaits: best.totalWaits,
        secondTotalWaits: second.totalWaits,
      },
    });
  }

  const bestValueRoute = getValueRouteSummary(best);
  const secondValueRoute = getValueRouteSummary(second);
  const valueDelta = best.scoreBreakdown.value - second.scoreBreakdown.value;
  if (
    valueDelta > 0
    && bestValueRoute
    && secondValueRoute
    && bestValueRoute.key !== secondValueRoute.key
  ) {
    best.reasons.push({
      type: "value",
      polarity: "positive",
      priority: 86,
      message: `相比切 ${second.discard}，切 ${best.discard} ${formatRouteSummary(bestValueRoute)}，打点路线更好。`,
      data: {
        discard: best.discard,
        secondDiscard: second.discard,
        valueDelta,
        primaryRoute: bestValueRoute.primary,
        secondaryRoute: bestValueRoute.secondary,
        secondPrimaryRoute: secondValueRoute.primary,
        secondSecondaryRoute: secondValueRoute.secondary,
      },
    });
  }

  if (
    best.totalWaits < second.totalWaits
    && best.scoreBreakdown.defense > second.scoreBreakdown.defense
  ) {
    best.reasons.push({
      type: "defenseComparison",
      polarity: "positive",
      priority: 88,
      message: `相比切 ${second.discard}，切 ${best.discard} 牺牲部分进张但显著降低对威胁者风险并保留后续防守资源。`,
      data: {
        discard: best.discard,
        secondDiscard: second.discard,
        totalWaits: best.totalWaits,
        secondTotalWaits: second.totalWaits,
        defenseDelta: best.scoreBreakdown.defense - second.scoreBreakdown.defense,
      },
    });
  }

  const preemptiveMiddleDiscard = getPreemptiveMiddleDiscardComparison(best, second, hand);
  if (preemptiveMiddleDiscard) {
    best.reasons.push({
      type: "defenseComparison",
      polarity: "positive",
      priority: 87,
      message: `与切 ${second.discard} 牌效接近时，先处理 ${best.discard} 这类中张，避免听牌时再切相对更危险的牌。`,
      data: {
        discard: best.discard,
        secondDiscard: second.discard,
        totalWaits: best.totalWaits,
        goodShapeCount: best.goodShapeCount,
        nextMiddleDangerDelta: preemptiveMiddleDiscard.nextMiddleDangerDelta,
      },
    });
  }

  const saferOuterDiscard = getSaferOuterDiscardComparison(best, second, hand);
  if (saferOuterDiscard) {
    best.reasons.push({
      type: "defenseComparison",
      polarity: "positive",
      priority: 87,
      message: `与切 ${second.discard} 牌效接近时，切 ${best.discard} 这类外侧牌，当前和转听牌时的中张压力更低。`,
      data: {
        discard: best.discard,
        secondDiscard: second.discard,
        totalWaits: best.totalWaits,
        goodShapeCount: best.goodShapeCount,
        safetyPressureDelta: saferOuterDiscard.safetyPressureDelta,
      },
    });
  }
}

function getPreemptiveMiddleDiscardComparison(
  best: EvaluatedNanikiruCandidate,
  second: EvaluatedNanikiruCandidate,
  hand: readonly TileId[],
): { nextMiddleDangerDelta: number } | undefined {
  if (!(
    best.shanten === 1
    && second.shanten === 1
    && best.totalWaits === second.totalWaits
    && best.goodShapeCount === second.goodShapeCount
    && isMiddleNumberTile(best.discard)
    && isOuterNumberTile(second.discard)
  )) {
    return undefined;
  }

  const bestNextMiddleDanger = estimateNextTenpaiMiddleDanger(hand, best);
  const secondNextMiddleDanger = estimateNextTenpaiMiddleDanger(hand, second);
  if (bestNextMiddleDanger >= secondNextMiddleDanger) {
    return undefined;
  }

  return {
    nextMiddleDangerDelta: secondNextMiddleDanger - bestNextMiddleDanger,
  };
}

function getSaferOuterDiscardComparison(
  best: EvaluatedNanikiruCandidate,
  second: EvaluatedNanikiruCandidate,
  hand: readonly TileId[],
): { safetyPressureDelta: number } | undefined {
  if (!(
    best.shanten === 1
    && second.shanten === 1
    && best.totalWaits === second.totalWaits
    && best.goodShapeCount === second.goodShapeCount
    && isOuterNumberTile(best.discard)
    && isMiddleNumberTile(second.discard)
  )) {
    return undefined;
  }

  const bestSafetyPressure = getProactiveSafetyPressure(hand, best);
  const secondSafetyPressure = getProactiveSafetyPressure(hand, second);
  if (bestSafetyPressure >= secondSafetyPressure) {
    return undefined;
  }

  return {
    safetyPressureDelta: secondSafetyPressure - bestSafetyPressure,
  };
}

function estimateNextTenpaiMiddleDanger(
  hand: readonly TileId[],
  candidate: EvaluatedNanikiruCandidate,
): number {
  const afterDiscard = removeOneTile(hand, candidate.discard);
  let weightedDanger = 0;

  for (const wait of candidate.waits) {
    const drawAnalysis = analyzeTiles([...afterDiscard, wait.id]);
    if (drawAnalysis.kind !== "discard") {
      continue;
    }

    const tenpaiDiscards = drawAnalysis.discards.filter((discard) => discard.shanten <= 0);
    if (tenpaiDiscards.length === 0) {
      continue;
    }

    const leastMiddleDanger = Math.min(
      ...tenpaiDiscards.map((discard) => getMiddleTileDanger(discard.discard.id)),
    );
    weightedDanger += leastMiddleDanger * wait.remaining;
  }

  return weightedDanger;
}

function getProactiveSafetyPressure(
  hand: readonly TileId[],
  candidate: EvaluatedNanikiruCandidate,
): number {
  return getMiddleTileDanger(candidate.discard) + estimateNextTenpaiMiddleDanger(hand, candidate);
}

function getMiddleTileDanger(tile: TileId): number {
  if (tile[1] === "z") {
    return 0;
  }

  const rank = Number(tile[0]);
  if (rank === 5) {
    return 3;
  }
  if (rank === 4 || rank === 6) {
    return 2;
  }
  if (rank === 3 || rank === 7) {
    return 1;
  }
  return 0;
}

function isMiddleNumberTile(tile: TileId): boolean {
  const rank = Number(tile[0]);
  return tile[1] !== "z" && rank >= 3 && rank <= 7;
}

function isOuterNumberTile(tile: TileId): boolean {
  const rank = Number(tile[0]);
  return tile[1] !== "z" && (rank <= 2 || rank >= 8);
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

interface ValueRouteSummary {
  key: string;
  primary: string;
  secondary?: string;
}

function getValueRouteSummary(candidate: EvaluatedNanikiruCandidate): ValueRouteSummary | undefined {
  const summaryReason = candidate.reasons.find((reason) => (
    reason.type === "value"
    && typeof reason.data?.primaryRoute === "string"
  ));
  const primary = summaryReason?.data?.primaryRoute;
  const secondary = summaryReason?.data?.secondaryRoute;
  if (typeof primary !== "string") {
    return undefined;
  }

  return {
    key: `${primary}:${typeof secondary === "string" ? secondary : ""}`,
    primary,
    secondary: typeof secondary === "string" ? secondary : undefined,
  };
}

function formatRouteSummary(summary: ValueRouteSummary): string {
  if (!summary.secondary) {
    return `以${formatRouteName(summary.primary)}为主要路线`;
  }
  return `以${formatRouteName(summary.primary)}为主，并兼顾${formatRouteName(summary.secondary)}`;
}

function formatRouteName(route: string): string {
  if (route === "scoring") {
    return "实算打点";
  }
  if (route === "yakuhai") {
    return "役牌";
  }
  if (route === "tanyao") {
    return "断幺";
  }
  if (route === "chiitoi") {
    return "七对子";
  }
  if (route === "honitsu") {
    return "染手";
  }
  if (route === "ittsu") {
    return "一气通贯";
  }
  if (route === "sanshoku") {
    return "三色同顺";
  }
  if (route === "chanta") {
    return "全带";
  }
  if (route === "toitoi") {
    return "对对和";
  }
  return route;
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

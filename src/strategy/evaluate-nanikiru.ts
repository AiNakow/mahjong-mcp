import type { TileId } from "../core/tile.ts";
import type { TileInfo } from "../hand/paili.ts";
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
    .sort(compareCandidates);

  const ordered = orderRecommendationCandidates(evaluated, analysis, policy);

  addComparativeReasons(ordered);

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

  const shantenScore = -candidate.shanten * policy.shantenWeight;
  reasons.push({
    type: "shanten",
    polarity: candidate.shanten <= analysis.shanten ? "neutral" : "negative",
    priority: 70,
    message: `切 ${candidate.discard} 后为 ${formatShanten(candidate.shanten)}。`,
    data: { discard: candidate.discard, shanten: candidate.shanten },
  });

  const ukeireMultiplier = isShantenBack ? policy.shantenBackUkeireMultiplier : 1;
  const ukeireScore = candidate.totalWaits * policy.ukeireWeight * ukeireMultiplier;
  reasons.push({
    type: "ukeire",
    polarity: isShantenBack ? "neutral" : "positive",
    priority: 90,
    message: isShantenBack
      ? `切 ${candidate.discard} 会退向，${candidate.totalWaits} 枚进张按改良价值折算。`
      : `切 ${candidate.discard} 后总进张 ${candidate.totalWaits} 枚。`,
    data: {
      discard: candidate.discard,
      totalWaits: candidate.totalWaits,
      shantenBack: isShantenBack,
      multiplier: ukeireMultiplier,
    },
  });

  const goodShapeMultiplier = isShantenBack ? policy.shantenBackGoodShapeMultiplier : 1;
  const goodShapeScore = candidate.goodShapeCount * policy.goodShapeWeight * goodShapeMultiplier;
  if (candidate.goodShapeCount > 0) {
    reasons.push({
      type: "good_shape",
      polarity: isShantenBack ? "neutral" : "positive",
      priority: 75,
      message: isShantenBack
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

function orderRecommendationCandidates(
  candidates: EvaluatedNanikiruCandidate[],
  analysis: DiscardAnalysis,
  policy: NanikiruPolicy,
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
  ));
  const heldBack = shantenBack.filter((candidate) => !allowedBack.includes(candidate));

  return [
    ...[...nonBack, ...allowedBack].sort(compareCandidates),
    ...heldBack.sort(compareCandidates),
  ];
}

function addComparativeReasons(candidates: EvaluatedNanikiruCandidate[]): void {
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

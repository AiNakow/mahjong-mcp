import type { TileId } from "../core/tile.ts";
import type { TileInfo } from "../hand/paili.ts";
import type { DiscardAnalysis, DiscardCandidate } from "../service/analyze.ts";
import { evaluateShape } from "./evaluators/evaluate-shape.ts";
import { evaluateValuePotential } from "./evaluators/evaluate-value.ts";
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
    .sort((a, b) => b.score - a.score || b.totalWaits - a.totalWaits);

  addComparativeReasons(evaluated);

  return {
    input: analysis.input,
    handText: analysis.handText,
    hand: analysis.hand,
    tileCount: analysis.tileCount,
    shanten: analysis.shanten,
    isTenpai: analysis.isTenpai,
    isAgari: analysis.isAgari,
    candidates: evaluated,
    recommendation: evaluated[0]?.discard,
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

  const shantenScore = -candidate.shanten * policy.shantenWeight;
  reasons.push({
    type: "shanten",
    polarity: candidate.shanten <= analysis.shanten ? "neutral" : "negative",
    priority: 70,
    message: `切 ${candidate.discard} 后为 ${formatShanten(candidate.shanten)}。`,
    data: { discard: candidate.discard, shanten: candidate.shanten },
  });

  const ukeireScore = candidate.totalWaits * policy.ukeireWeight;
  reasons.push({
    type: "ukeire",
    polarity: "positive",
    priority: 90,
    message: `切 ${candidate.discard} 后总进张 ${candidate.totalWaits} 枚。`,
    data: { discard: candidate.discard, totalWaits: candidate.totalWaits },
  });

  const goodShapeScore = candidate.goodShapeCount * policy.goodShapeWeight;
  if (candidate.goodShapeCount > 0) {
    reasons.push({
      type: "good_shape",
      polarity: "positive",
      priority: 75,
      message: `其中好形相关进张 ${candidate.goodShapeCount} 枚。`,
      data: {
        discard: candidate.discard,
        goodShapeCount: candidate.goodShapeCount,
        goodShapeDraws: candidate.goodShapeDraws,
      },
    });
  }

  const shapeEvaluation = evaluateShape(afterDiscard, candidate);
  const valueEvaluation = evaluateValuePotential(afterDiscard, candidate.discard, policy, {
    shanten: candidate.shanten,
    waits: candidate.waits,
    context,
  });
  const defenseEvaluation = evaluateDefense(candidate.discard, context);

  const scoreBreakdown: NanikiruScoreBreakdown = {
    shanten: shantenScore,
    ukeire: ukeireScore,
    goodShape: goodShapeScore,
    shape: shapeEvaluation.score * policy.shapeWeight,
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
      ...valueEvaluation.reasons,
      ...defenseEvaluation.reasons,
    ],
  };
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

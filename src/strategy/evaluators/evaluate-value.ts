import type { TileId } from "../../core/tile.ts";
import { calculateAgariScore } from "../../scoring/index.ts";
import { analyzeTiles } from "../../hand/paili.ts";
import type { NanikiruPolicy } from "../nanikiru-policy.ts";
import { isOpenHand, type NanikiruContext } from "../nanikiru-context.ts";
import type { EvaluationPart } from "./evaluation.ts";
import type { TileInfo } from "../../hand/paili.ts";
import type { CandidateFeature } from "../features.ts";
import { evaluateRoutePortfolio, type RouteEvaluation, type RoutePortfolio } from "../routes.ts";

export type ValueRoute =
  | "scoring"
  | "two_layer_scoring"
  | "dora"
  | "yakuhai"
  | "tanyao"
  | "chiitoi"
  | "honitsu"
  | "ittsu"
  | "sanshoku"
  | "chanta_sanshoku"
  | "chanta"
  | "toitoi";

interface ValueRouteScore {
  route: ValueRoute;
  score: number;
  reasons: EvaluationPart["reasons"];
  data?: Record<string, unknown>;
}

interface TwoLayerEstimate {
  averagePoints: number;
  bestDraw?: TileId;
  bestAverage: number;
  totalRemaining: number;
}

const TWO_LAYER_ESTIMATE_CACHE = new Map<string, TwoLayerEstimate>();

export function evaluateValuePotential(
  afterDiscard: readonly TileId[],
  discard: TileId,
  policy: NanikiruPolicy,
  context: {
    shanten?: number;
    waits?: readonly TileInfo[];
    context?: NanikiruContext;
    feature: CandidateFeature;
    routePortfolio?: RoutePortfolio;
  },
): EvaluationPart {
  const nanikiruContext = context.context ?? {};
  const tenpaiScoringRoute = evaluateTenpaiScoringRoute(afterDiscard, discard, policy, context);
  const hasTenpaiScoringValue = context.shanten === 0 && tenpaiScoringRoute.score > 0;
  const staticRouteScores = (context.routePortfolio ?? evaluateRoutePortfolio(context.feature, policy, nanikiruContext))
    .routes
    .filter((route) => context.shanten !== 0 || route.id === "dora" || hasTenpaiScoringValue)
    .map(toValueRouteScore);

  const routeScores = [
    tenpaiScoringRoute,
    evaluateIishantenTwoLayerScoringRoute(afterDiscard, discard, policy, context),
    ...staticRouteScores,
  ].filter((route) => route.score > 0)
    .sort((a, b) => b.score - a.score);

  const primary = routeScores[0];
  const secondary = routeScores[1];
  if (!primary) {
    return { score: 0, reasons: [] };
  }

  const score = primary.score + (secondary?.score ?? 0) * policy.secondaryValueRouteRatio;
  const reasons = [
    ...primary.reasons,
    ...(secondary ? secondary.reasons.map((reason) => ({
      ...reason,
      priority: Math.max(1, reason.priority - 18),
      data: {
        ...reason.data,
        secondaryRoute: true,
        appliedRatio: policy.secondaryValueRouteRatio,
      },
    })) : []),
  ];

  reasons.push({
    type: "value",
    polarity: "neutral",
    priority: 42,
    message: secondary
      ? `打点潜力以${formatRoute(primary.route)}为主，${formatRoute(secondary.route)}作为次要路线折算。`
      : `打点潜力以${formatRoute(primary.route)}为主。`,
    data: {
      primaryRoute: primary.route,
      primaryScore: primary.score,
      secondaryRoute: secondary?.route,
      secondaryScore: secondary?.score,
      secondaryRatio: policy.secondaryValueRouteRatio,
      valueScore: score,
    },
  });

  return { score, reasons };
}

function toValueRouteScore(route: RouteEvaluation): ValueRouteScore {
  return {
    route: route.id as ValueRoute,
    score: route.value,
    reasons: route.reasons,
    data: route.data,
  };
}

function evaluateIishantenTwoLayerScoringRoute(
  afterDiscard: readonly TileId[],
  discard: TileId,
  policy: NanikiruPolicy,
  context: { shanten?: number; waits?: readonly TileInfo[]; context?: NanikiruContext; feature: CandidateFeature },
): ValueRouteScore {
  if (
    !policy.useTwoLayerValueForIishanten
    || context.shanten !== 1
    || !context.waits
    || context.waits.length === 0
  ) {
    return { route: "two_layer_scoring", score: 0, reasons: [] };
  }

  const cacheKey = getTwoLayerCacheKey(afterDiscard, policy, context);
  const cached = TWO_LAYER_ESTIMATE_CACHE.get(cacheKey);
  const estimate = cached ?? estimateIishantenTwoLayer(afterDiscard, policy, context);
  if (!cached) {
    TWO_LAYER_ESTIMATE_CACHE.set(cacheKey, estimate);
  }

  const { averagePoints, bestDraw, bestAverage, totalRemaining } = estimate;
  if (totalRemaining <= 0 || averagePoints < policy.twoLayerMinAveragePoints) {
    return { route: "two_layer_scoring", score: 0, reasons: [] };
  }

  const score = Math.round(averagePoints / policy.twoLayerValueDivisor);
  return {
    route: "two_layer_scoring",
    score,
    reasons: [{
      type: "value",
      polarity: "positive",
      priority: getHighPointsPriority(averagePoints, averagePoints >= 7700 ? 78 : 64),
      message: `一向听进张转听牌后的平均打点约 ${averagePoints} 点。`,
      data: {
        discard,
        averagePoints,
        bestDraw,
        bestAverage: Math.round(bestAverage),
        totalRemaining,
        twoLayerValueDivisor: policy.twoLayerValueDivisor,
        primaryRoute: "two_layer_scoring",
        highPoints: averagePoints >= 7700,
      },
    }],
  };
}

function estimateIishantenTwoLayer(
  afterDiscard: readonly TileId[],
  policy: NanikiruPolicy,
  context: { shanten?: number; waits?: readonly TileInfo[]; context?: NanikiruContext; feature: CandidateFeature },
): TwoLayerEstimate {
  const mode = isOpenHand(context.context) ? 1 : 0;
  let weightedTotal = 0;
  let totalRemaining = 0;
  let bestDraw: TileId | undefined;
  let bestAverage = 0;

  const drawsToEvaluate = [...(context.waits ?? [])]
    .filter((draw) => draw.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, policy.twoLayerMaxDrawTypes);

  for (const draw of drawsToEvaluate) {
    if (draw.remaining <= 0) {
      continue;
    }
    const afterDraw = [...afterDiscard, draw.id];
    const analysis = analyzeTiles(afterDraw, mode, { includeShantenBack: true });
    if (analysis.kind !== "discard") {
      continue;
    }

    let bestTenpaiAverage = 0;
    const tenpaiDiscards = analysis.discards
      .filter((nextDiscard) => nextDiscard.shanten === 0)
      .sort((a, b) => b.total_waits - a.total_waits)
      .slice(0, policy.twoLayerMaxTenpaiDiscards);
    for (const nextDiscard of tenpaiDiscards) {
      const tenpaiHand = removeOneTile(afterDraw, nextDiscard.discard.id);
      const average = estimateWeightedAgariPoints(tenpaiHand, nextDiscard.waits, context.context, policy);
      if (average > bestTenpaiAverage) {
        bestTenpaiAverage = average;
      }
    }

    if (bestTenpaiAverage <= 0) {
      continue;
    }
    weightedTotal += bestTenpaiAverage * draw.remaining;
    totalRemaining += draw.remaining;
    if (bestTenpaiAverage > bestAverage) {
      bestAverage = bestTenpaiAverage;
      bestDraw = draw.id;
    }
  }

  return {
    averagePoints: totalRemaining > 0 ? Math.round(weightedTotal / totalRemaining) : 0,
    bestDraw,
    bestAverage,
    totalRemaining,
  };
}

function evaluateTenpaiScoringRoute(
  afterDiscard: readonly TileId[],
  discard: TileId,
  policy: NanikiruPolicy,
  context: { shanten?: number; waits?: readonly TileInfo[]; context?: NanikiruContext },
): ValueRouteScore {
  if (!policy.useScoringForTenpaiValue || context.shanten !== 0 || !context.waits || context.waits.length === 0) {
    return { route: "scoring", score: 0, reasons: [] };
  }

  let bestTotal = 0;
  let bestWait: TileId | undefined;
  for (const wait of context.waits) {
    const result = calculateAgariScore({
      hand: [...afterDiscard, wait.id],
      winningTile: wait.id,
      method: "ron",
      calls: context.context?.calls,
      seatWind: context.context?.seatWind,
      bakaze: context.context?.bakaze,
      rules: context.context?.rules,
      honba: context.context?.honba,
      riichiSticks: context.context?.riichiSticks,
      doraIndicators: context.context?.doraIndicators,
      uraDoraIndicators: context.context?.uraDoraIndicators,
      akaDoraCount: context.context?.akaDoraCount,
    });
    if (result.best && result.best.points.total > bestTotal) {
      bestTotal = result.best.points.total;
      bestWait = wait.id;
    }
  }

  if (bestTotal <= 0 || !bestWait) {
    return { route: "scoring", score: 0, reasons: [] };
  }

  const score = Math.round(bestTotal / policy.scoringValueDivisor);
  return {
    route: "scoring",
    score,
    reasons: [{
      type: "value",
      polarity: "positive",
      priority: getHighPointsPriority(bestTotal, 76),
      message: `听牌后最高和牌点数约 ${bestTotal} 点，待牌 ${bestWait}。`,
      data: { discard, bestWait, bestTotal, scoringValueDivisor: policy.scoringValueDivisor, highPoints: bestTotal >= 7700 },
    }],
  };
}

function getHighPointsPriority(points: number, fallbackPriority: number): number {
  if (points >= 12000) {
    return 92;
  }
  if (points >= 7700) {
    return 86;
  }
  return Math.max(fallbackPriority, 64);
}

function estimateWeightedAgariPoints(
  tenpaiHand: readonly TileId[],
  waits: readonly TileInfo[],
  context: NanikiruContext = {},
  policy: NanikiruPolicy,
): number {
  let weightedTotal = 0;
  let totalRemaining = 0;
  const assumeRiichi = policy.assumeRiichiForMenzenTwoLayer && isMenzenContext(context);

  for (const wait of waits) {
    if (wait.remaining <= 0) {
      continue;
    }
    const result = calculateAgariScore({
      hand: [...tenpaiHand, wait.id],
      winningTile: wait.id,
      method: "ron",
      calls: context.calls,
      seatWind: context.seatWind,
      bakaze: context.bakaze,
      rules: context.rules,
      honba: context.honba,
      riichiSticks: context.riichiSticks,
      doraIndicators: context.doraIndicators,
      uraDoraIndicators: context.uraDoraIndicators,
      akaDoraCount: context.akaDoraCount,
      riichi: assumeRiichi,
    });
    if (!result.best) {
      continue;
    }
    weightedTotal += result.best.points.total * wait.remaining;
    totalRemaining += wait.remaining;
  }

  return totalRemaining > 0 ? weightedTotal / totalRemaining : 0;
}

function getTwoLayerCacheKey(
  afterDiscard: readonly TileId[],
  policy: NanikiruPolicy,
  context: { shanten?: number; waits?: readonly TileInfo[]; context?: NanikiruContext },
): string {
  const scoringContext = context.context ?? {};
  return JSON.stringify({
    hand: [...afterDiscard].sort(),
    waits: (context.waits ?? []).map((wait) => [wait.id, wait.remaining]),
    calls: scoringContext.calls ?? [],
    seatWind: scoringContext.seatWind,
    bakaze: scoringContext.bakaze,
    honba: scoringContext.honba,
    riichiSticks: scoringContext.riichiSticks,
    doraIndicators: scoringContext.doraIndicators ?? [],
    uraDoraIndicators: scoringContext.uraDoraIndicators ?? [],
    akaDoraCount: scoringContext.akaDoraCount ?? 0,
    rules: scoringContext.rules,
    maxDrawTypes: policy.twoLayerMaxDrawTypes,
    maxTenpaiDiscards: policy.twoLayerMaxTenpaiDiscards,
    assumeRiichi: policy.assumeRiichiForMenzenTwoLayer,
  });
}

function isMenzenContext(context: NanikiruContext): boolean {
  return (context.calls ?? []).every((call) => call.type === "ankan");
}

function removeOneTile(tiles: readonly TileId[], tile: TileId): TileId[] {
  const result = [...tiles];
  const index = result.indexOf(tile);
  if (index >= 0) {
    result.splice(index, 1);
  }
  return result;
}

function formatRoute(route: ValueRoute): string {
  if (route === "scoring") {
    return "实算打点";
  }
  if (route === "two_layer_scoring") {
    return "一向听转听牌打点";
  }
  if (route === "dora") {
    return "宝牌";
  }
  if (route === "yakuhai") {
    return "役牌路线";
  }
  if (route === "tanyao") {
    return "断幺路线";
  }
  if (route === "chiitoi") {
    return "七对子路线";
  }
  if (route === "honitsu") {
    return "染手路线";
  }
  if (route === "ittsu") {
    return "一气通贯路线";
  }
  if (route === "sanshoku") {
    return "三色同顺路线";
  }
  if (route === "chanta_sanshoku") {
    return "全带三色复合路线";
  }
  if (route === "chanta") {
    return "全带路线";
  }
  return "对对和路线";
}

import type { TileId } from "../core/tile.ts";
import { analyzeTiles } from "../hand/paili.ts";
import type { DiscardAnalysis, DiscardCandidate } from "../service/analyze.ts";
import type { NanikiruPolicy } from "./nanikiru-policy.ts";
import type { NanikiruContext } from "./nanikiru-context.ts";
import type { EvaluatedNanikiruCandidate } from "./evaluate-nanikiru.ts";

export function orderNanikiruCandidates(
  candidates: EvaluatedNanikiruCandidate[],
  analysis: DiscardAnalysis,
  policy: NanikiruPolicy,
  context: NanikiruContext,
  options: {
    isEarlyLowValueTenpaiImprovement: (analysis: DiscardAnalysis, candidate: DiscardCandidate, policy: NanikiruPolicy, context: NanikiruContext) => boolean;
  },
): EvaluatedNanikiruCandidate[] {
  const evaluated = [...candidates].sort((a, b) => compareCandidatesForRecommendation(a, b, analysis.hand));
  const ordered = orderRecommendationCandidates(evaluated, analysis, policy, context, options);
  addComparativeReasons(ordered, analysis.hand);
  return ordered;
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
  options: {
    isEarlyLowValueTenpaiImprovement: (analysis: DiscardAnalysis, candidate: DiscardCandidate, policy: NanikiruPolicy, context: NanikiruContext) => boolean;
  },
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
    || options.isEarlyLowValueTenpaiImprovement(analysis, candidate, policy, context)
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

import { TILE_INDEX, TILES_34, type TileId } from "../core/tile.ts";
import { analyzeTiles } from "../hand/paili.ts";
import { calculateAgariScore } from "../scoring/index.ts";
import { calculatePoints } from "../scoring/points.ts";
import type { PointResult, ScoreCandidate } from "../scoring/types.ts";
import type { DiscardCandidate } from "../service/analyze.ts";
import type { NanikiruContext } from "./nanikiru-context.ts";

export type RiichiLevel =
  | "strong_recommend"
  | "recommend"
  | "neutral"
  | "discourage"
  | "strong_discourage";

export interface RiichiJudgment {
  canRiichi: boolean;
  shouldRiichi: boolean;
  score: number;
  level: RiichiLevel;
  levelText: string;
  confidence: number;
  reasons: string[];
  details: {
    damaAveragePoints: number;
    riichiAveragePoints: number;
    pointGain: number;
    totalWaits: number;
    goodShapeRatio: number;
    allWaitsHaveYaku: boolean;
    anyWaitHasYaku: boolean;
    improvementTiles: number;
    improvementDraws: TileId[];
    shapeImprovementTiles: number;
    valueImprovementTiles: number;
    valueImprovementDraws: TileId[];
    bestImprovedWaits: number;
    bestImprovedDamaPoints: number;
    improvementTurnMultiplier: number;
    uraEstimate: UraEstimate;
    remainingTurns: number;
  };
}

export type UraUpgrade = "none" | "mangan" | "haneman" | "baiman_or_better";

export interface UraEstimate {
  indicatorCount: number;
  expectedUraHan: number;
  hitRate: number;
  multiHitRate: number;
  expectedScoreGain: number;
  upgrade: UraUpgrade;
  upgradeProbability: number;
  scoreBonus: number;
  reasons: string[];
}

interface ImprovementSummary {
  improvementTiles: number;
  drawTypes: number;
  improvementDraws: TileId[];
  shapeImprovementTiles: number;
  valueImprovementTiles: number;
  valueImprovementDraws: TileId[];
  bestImprovedWaits: number;
  bestImprovedDamaPoints: number;
}

interface WaitScoreSummary {
  averagePoints: number;
  bestPoints: number;
  scoredWaits: number;
}

interface PlacementSummary {
  selfRank: number;
  diffToNext: number;
  diffToFirst: number;
  leadOverSecond: number;
  isSouthRound: boolean;
  isFinalOrNearFinal: boolean;
}

const MANGAN_POINTS = 8000;
const TENPAI_IMPROVEMENT_CACHE = new Map<string, ImprovementSummary>();
const EMPTY_URA_ESTIMATE: UraEstimate = {
  indicatorCount: 0,
  expectedUraHan: 0,
  hitRate: 0,
  multiHitRate: 0,
  expectedScoreGain: 0,
  upgrade: "none",
  upgradeProbability: 0,
  scoreBonus: 0,
  reasons: [],
};

export function evaluateRiichiJudgment(
  handAfterDiscard: readonly TileId[],
  candidate: DiscardCandidate,
  context: NanikiruContext = {},
): RiichiJudgment {
  const totalWaits = candidate.waits.reduce((total, wait) => total + Math.max(0, wait.remaining), 0);
  const goodShapeRatio = totalWaits > 0 ? candidate.goodShapeCount / totalWaits : 0;
  const remainingTurns = Math.max(0, 18 - (context.turn ?? 8));
  const canRiichi = isMenzen(context)
    && candidate.shanten === 0
    && totalWaits > 0
    && (context.points ?? 25000) >= 1000;

  if (!canRiichi) {
    return buildJudgment({
      score: -100,
      canRiichi,
      reasons: ["当前不满足立直前提。"],
      details: {
        damaAveragePoints: 0,
        riichiAveragePoints: 0,
        pointGain: 0,
        totalWaits,
        goodShapeRatio,
        allWaitsHaveYaku: false,
        anyWaitHasYaku: false,
        improvementTiles: 0,
        improvementDraws: [],
        shapeImprovementTiles: 0,
        valueImprovementTiles: 0,
        valueImprovementDraws: [],
        bestImprovedWaits: 0,
        bestImprovedDamaPoints: 0,
        improvementTurnMultiplier: 0,
        uraEstimate: EMPTY_URA_ESTIMATE,
        remainingTurns,
      },
    });
  }

  const dama = summarizeWaitScores(handAfterDiscard, candidate, context, false);
  const riichi = summarizeWaitScores(handAfterDiscard, candidate, context, true);
  const uraEstimate = estimateUra(handAfterDiscard, candidate, context);
  const anyWaitHasYaku = dama.scoredWaits > 0;
  const allWaitsHaveYaku = dama.scoredWaits === countLiveWaitTypes(candidate);
  const pointGain = riichi.averagePoints - dama.averagePoints;
  const placement = buildPlacementSummary(context);
  let improvement: ImprovementSummary = {
    improvementTiles: 0,
    drawTypes: 0,
    improvementDraws: [],
    shapeImprovementTiles: 0,
    valueImprovementTiles: 0,
    valueImprovementDraws: [],
    bestImprovedWaits: 0,
    bestImprovedDamaPoints: 0,
  };
  const activeThreats = (context.opponents ?? []).filter((opponent) => (
    opponent.riichi === true || (opponent.calls ?? []).length >= 2
  ));

  let score = 0;
  const reasons: string[] = [];
  const improvementTurnMultiplier = getImprovementTurnMultiplier(context.turn ?? 8);

  if (!anyWaitHasYaku) {
    score += 60;
    reasons.push("默听没有役，立直能把所有待牌变成可和。");
  } else if (!allWaitsHaveYaku) {
    score += 35;
    reasons.push("部分待牌默听无役，立直能扩大有效和牌范围。");
  }

  if (dama.averagePoints < MANGAN_POINTS) {
    score += 25;
    reasons.push("立直前未到满贯，立直带来的打点提升较重要。");
  }
  if (dama.averagePoints >= MANGAN_POINTS && allWaitsHaveYaku) {
    score -= 25;
    reasons.push("默听已有满贯级别且所有待牌有役，立直必要性下降。");
  }
  if (dama.averagePoints >= 12000 && allWaitsHaveYaku) {
    score -= 40;
    reasons.push("默听已达到跳满以上，保留防守和出和灵活性更有价值。");
  }

  if (totalWaits >= 8) {
    score += 25;
    reasons.push("听牌枚数多，立直后的和牌率基础较好。");
  } else if (totalWaits >= 5) {
    score += 15;
    reasons.push("听牌枚数尚可，立直有一定和率支撑。");
  } else if (totalWaits <= 2) {
    score -= 20;
    reasons.push("听牌枚数偏少，立直后被锁手的代价较高。");
  }
  const shouldCheckImprovement = totalWaits <= 4
    && goodShapeRatio <= 0.2
    && remainingTurns >= 5
    && (
      riichi.averagePoints <= 2600
      || ((context.turn ?? 8) <= 8 && totalWaits <= 4)
    );
  if (shouldCheckImprovement) {
    improvement = estimateTenpaiImprovement(handAfterDiscard, candidate, context, {
      currentDamaPoints: dama.averagePoints,
      currentRiichiPoints: riichi.averagePoints,
    });
    if (riichi.averagePoints <= 2600 && improvement.improvementTiles >= 8) {
      score -= Math.round(65 * improvementTurnMultiplier);
      reasons.push(formatImprovementReason(improvement, improvementTurnMultiplier));
    } else if (improvement.shapeImprovementTiles >= 8) {
      const highValuePenalty = calculateHighValueNarrowImprovementPenalty(
        improvement,
        riichi.averagePoints,
        improvementTurnMultiplier,
      );
      if (highValuePenalty > 0) {
        score -= highValuePenalty;
        reasons.push(formatHighValueNarrowImprovementReason(improvement, highValuePenalty));
      }
    }
  }
  if (pointGain >= 3900) {
    score += 30;
    reasons.push("立直后的平均打点提升很明显。");
  } else if (pointGain >= 2000) {
    score += 20;
    reasons.push("立直能带来可观的平均打点提升。");
  }
  if (goodShapeRatio >= 0.6) {
    score += 20;
    reasons.push("听牌形较好，立直后的和率更稳定。");
  } else if (goodShapeRatio <= 0.2 && totalWaits <= 4) {
    score -= 10;
    reasons.push("待牌形状偏差，立直收益需要打点或局况支撑。");
  }
  if (riichi.averagePoints <= 2600 && totalWaits <= 4 && goodShapeRatio <= 0.2) {
    score -= 30;
    reasons.push("立直后仍是低打点窄听，强行立直的必要性下调。");
  }
  if (uraEstimate.scoreBonus > 0 && !(placement.isFinalOrNearFinal && placement.selfRank === 1)) {
    score += uraEstimate.scoreBonus;
    reasons.push(...uraEstimate.reasons);
  }

  score += evaluateWaitVisibility(candidate, context, reasons);
  score += evaluatePlacementNeed(dama.averagePoints, riichi.averagePoints, placement, reasons);
  score += evaluateRisk(activeThreats.length, remainingTurns, reasons);

  return buildJudgment({
    score,
    canRiichi,
    reasons,
    details: {
      damaAveragePoints: dama.averagePoints,
      riichiAveragePoints: riichi.averagePoints,
      pointGain,
      totalWaits,
      goodShapeRatio,
      allWaitsHaveYaku,
      anyWaitHasYaku,
      improvementTiles: improvement.improvementTiles,
      improvementDraws: improvement.improvementDraws,
      shapeImprovementTiles: improvement.shapeImprovementTiles,
      valueImprovementTiles: improvement.valueImprovementTiles,
      valueImprovementDraws: improvement.valueImprovementDraws,
      bestImprovedWaits: improvement.bestImprovedWaits,
      bestImprovedDamaPoints: improvement.bestImprovedDamaPoints,
      improvementTurnMultiplier,
      uraEstimate,
      remainingTurns,
    },
  });
}

function estimateUra(
  handAfterDiscard: readonly TileId[],
  candidate: DiscardCandidate,
  context: NanikiruContext,
): UraEstimate {
  const indicatorCount = getUraIndicatorCount(context);
  if (indicatorCount <= 0) {
    return EMPTY_URA_ESTIMATE;
  }

  let totalRemaining = 0;
  let expectedUraHan = 0;
  let hitRate = 0;
  let multiHitRate = 0;
  let expectedScoreGain = 0;
  let upgradeProbability = 0;
  let bestUpgrade: UraUpgrade = "none";

  for (const wait of candidate.waits) {
    if (wait.remaining <= 0) {
      continue;
    }
    const base = scoreWait(handAfterDiscard, wait.id, context, true);
    if (!base) {
      continue;
    }
    const hand14 = [...handAfterDiscard, wait.id];
    const estimate = estimateUraForAgari(hand14, base, context, indicatorCount);
    totalRemaining += wait.remaining;
    expectedUraHan += estimate.expectedUraHan * wait.remaining;
    hitRate += estimate.hitRate * wait.remaining;
    multiHitRate += estimate.multiHitRate * wait.remaining;
    expectedScoreGain += estimate.expectedScoreGain * wait.remaining;
    upgradeProbability += estimate.upgradeProbability * wait.remaining;
    bestUpgrade = maxUpgrade(bestUpgrade, estimate.upgrade);
  }

  if (totalRemaining <= 0) {
    return EMPTY_URA_ESTIMATE;
  }

  const averaged: UraEstimate = {
    indicatorCount,
    expectedUraHan: round2(expectedUraHan / totalRemaining),
    hitRate: round2(hitRate / totalRemaining),
    multiHitRate: round2(multiHitRate / totalRemaining),
    expectedScoreGain: Math.round(expectedScoreGain / totalRemaining),
    upgrade: bestUpgrade,
    upgradeProbability: round2(upgradeProbability / totalRemaining),
    scoreBonus: 0,
    reasons: [],
  };
  averaged.scoreBonus = calculateUraScoreBonus(averaged);
  averaged.reasons = formatUraReasons(averaged);
  return averaged;
}

function estimateUraForAgari(
  hand14: readonly TileId[],
  base: ScoreCandidate,
  context: NanikiruContext,
  indicatorCount: number,
): UraEstimate {
  const counts = countHandTiles(hand14);
  const uniqueCount = counts.filter((item) => item.count > 0).length;
  const multiCount = counts.filter((item) => item.count >= 2).length;
  const hitRate = 1 - ((34 - uniqueCount) / 34) ** indicatorCount;
  const multiHitRate = multiCount > 0 ? 1 - ((34 - multiCount) / 34) ** indicatorCount : 0;
  const expectedUraHan = hand14.length * indicatorCount / 34;

  let singleIndicatorGain = 0;
  let singleIndicatorUpgradeProbability = 0;
  let bestUpgrade: UraUpgrade = "none";

  for (const { count } of counts) {
    if (count <= 0 || base.han <= 0) {
      continue;
    }
    const upgradedPointResult = calculatePoints(makePointContext(context), base.han + count, base.fu);
    const upgradedPoints = upgradedPointResult.total;
    singleIndicatorGain += Math.max(0, upgradedPoints - base.points.total) / 34;

    const upgrade = getPointUpgrade(base.points, upgradedPointResult);
    if (upgrade !== "none") {
      singleIndicatorUpgradeProbability += 1 / 34;
      bestUpgrade = maxUpgrade(bestUpgrade, upgrade);
    }
  }

  return {
    indicatorCount,
    expectedUraHan: round2(expectedUraHan),
    hitRate: round2(hitRate),
    multiHitRate: round2(multiHitRate),
    expectedScoreGain: Math.round(singleIndicatorGain * indicatorCount),
    upgrade: bestUpgrade,
    upgradeProbability: round2(Math.min(1, singleIndicatorUpgradeProbability * indicatorCount)),
    scoreBonus: 0,
    reasons: [],
  };
}

function getUraIndicatorCount(context: NanikiruContext): number {
  return context.doraIndicators?.length ?? 0;
}

function countHandTiles(hand: readonly TileId[]): { tile: TileId; count: number }[] {
  return TILES_34.map((tile) => ({
    tile,
    count: hand.filter((item) => item === tile).length,
  }));
}

function makePointContext(context: NanikiruContext) {
  return {
    hand: ["1m", "1m", "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "8m", "8m", "9m", "9m"] as TileId[],
    winningTile: "9m" as TileId,
    method: "ron" as const,
    seatWind: context.seatWind,
    honba: context.honba,
    riichiSticks: context.riichiSticks,
  };
}

function getPointUpgrade(before: PointResult, after: PointResult): UraUpgrade {
  const beforeRank = getPointRank(before);
  const afterRank = getPointRank(after);
  if (afterRank <= beforeRank) {
    return "none";
  }
  if (after.limit === "baiman" || after.limit === "sanbaiman" || after.limit === "yakuman") {
    return "baiman_or_better";
  }
  if (after.limit === "haneman") {
    return "haneman";
  }
  if (after.limit === "mangan" || before.total < MANGAN_POINTS && after.total >= MANGAN_POINTS) {
    return "mangan";
  }
  return "none";
}

function getPointRank(points: PointResult): number {
  if (points.limit === "yakuman") {
    return 5;
  }
  if (points.limit === "sanbaiman") {
    return 4;
  }
  if (points.limit === "baiman") {
    return 3;
  }
  if (points.limit === "haneman") {
    return 2;
  }
  if (points.limit === "mangan" || points.total >= MANGAN_POINTS) {
    return 1;
  }
  return 0;
}

function maxUpgrade(a: UraUpgrade, b: UraUpgrade): UraUpgrade {
  return getUpgradeRank(b) > getUpgradeRank(a) ? b : a;
}

function getUpgradeRank(upgrade: UraUpgrade): number {
  if (upgrade === "baiman_or_better") {
    return 3;
  }
  if (upgrade === "haneman") {
    return 2;
  }
  if (upgrade === "mangan") {
    return 1;
  }
  return 0;
}

function calculateUraScoreBonus(estimate: UraEstimate): number {
  let bonus = 0;
  if (estimate.indicatorCount >= 2) {
    bonus += 3;
  }
  if (estimate.expectedUraHan >= 0.7) {
    bonus += 6;
  } else if (estimate.expectedUraHan >= 0.35) {
    bonus += 3;
  }
  if (estimate.multiHitRate >= 0.12) {
    bonus += 4;
  }
  if (estimate.expectedScoreGain >= 1000) {
    bonus += 8;
  } else if (estimate.expectedScoreGain >= 500) {
    bonus += 4;
  }
  if (estimate.upgradeProbability >= 0.1) {
    bonus += estimate.upgrade === "mangan" ? 8 : 6;
  } else if (estimate.upgradeProbability >= 0.05) {
    bonus += estimate.upgrade === "mangan" ? 4 : 3;
  } else if (estimate.upgrade !== "none") {
    bonus += 2;
  }
  return Math.min(25, bonus);
}

function formatUraReasons(estimate: UraEstimate): string[] {
  if (estimate.scoreBonus <= 0) {
    return [];
  }
  const reasons: string[] = [];
  if (estimate.indicatorCount >= 2) {
    reasons.push(`当前有 ${estimate.indicatorCount} 张宝牌指示牌，立直后的里宝机会提高。`);
  }
  if (estimate.hitRate >= 0.3 || estimate.expectedUraHan >= 0.35) {
    reasons.push(`手牌里宝命中率约 ${formatPercent(estimate.hitRate)}，期望里宝约 ${estimate.expectedUraHan} 番。`);
  }
  if (estimate.multiHitRate >= 0.12) {
    reasons.push("手牌含对子或刻子，中里时有多枚里宝潜力。");
  }
  if (estimate.upgrade !== "none") {
    reasons.push(`里宝有机会把立直打点推进到${formatUpgrade(estimate.upgrade)}档。`);
  } else if (estimate.expectedScoreGain >= 500) {
    reasons.push(`里宝期望点数增益约 ${estimate.expectedScoreGain} 点。`);
  }
  return reasons;
}

function formatUpgrade(upgrade: UraUpgrade): string {
  if (upgrade === "mangan") {
    return "满贯";
  }
  if (upgrade === "haneman") {
    return "跳满";
  }
  if (upgrade === "baiman_or_better") {
    return "倍满以上";
  }
  return "无";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function summarizeWaitScores(
  handAfterDiscard: readonly TileId[],
  candidate: DiscardCandidate,
  context: NanikiruContext,
  riichi: boolean,
): WaitScoreSummary {
  let weightedTotal = 0;
  let totalRemaining = 0;
  let bestPoints = 0;
  let scoredWaits = 0;

  for (const wait of candidate.waits) {
    if (wait.remaining <= 0) {
      continue;
    }
    const best = scoreWait(handAfterDiscard, wait.id, context, riichi);
    if (!best) {
      continue;
    }
    scoredWaits += 1;
    weightedTotal += best.points.total * wait.remaining;
    totalRemaining += wait.remaining;
    bestPoints = Math.max(bestPoints, best.points.total);
  }

  return {
    averagePoints: totalRemaining > 0 ? Math.round(weightedTotal / totalRemaining) : 0,
    bestPoints,
    scoredWaits,
  };
}

function scoreWait(
  handAfterDiscard: readonly TileId[],
  wait: TileId,
  context: NanikiruContext,
  riichi: boolean,
): ScoreCandidate | undefined {
  return calculateAgariScore({
    hand: [...handAfterDiscard, wait],
    winningTile: wait,
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
    riichi,
  }).best;
}

function countLiveWaitTypes(candidate: DiscardCandidate): number {
  return candidate.waits.filter((wait) => wait.remaining > 0).length;
}

function evaluateWaitVisibility(
  candidate: DiscardCandidate,
  context: NanikiruContext,
  reasons: string[],
): number {
  if (!context.visibleTiles) {
    return 0;
  }
  const liveWaits = candidate.waits.filter((wait) => wait.remaining > 0);
  if (liveWaits.length === 0) {
    return 0;
  }

  const easyWaits = liveWaits.filter((wait) => {
    const visibleCount = context.visibleTiles?.[TILE_INDEX[wait.id]] ?? 0;
    return wait.id[1] === "z" ? visibleCount <= 1 : isTerminalOrEdge(wait.id);
  }).length;
  if (easyWaits >= liveWaits.length / 2) {
    reasons.push("待牌相对容易被打出，立直后的出和率上调。");
    return 15;
  }
  return 0;
}

function evaluatePlacementNeed(
  damaPoints: number,
  riichiPoints: number,
  placement: PlacementSummary,
  reasons: string[],
): number {
  let score = 0;
  if (placement.isSouthRound && placement.selfRank >= 3 && placement.diffToFirst >= 12000) {
    score += 30;
    reasons.push("南场落后较多，需要通过立直提高回收差距的能力。");
  }
  if (placement.selfRank === 4) {
    score += 30;
    reasons.push("当前四位，立直带来的打点上限更重要。");
  }
  if (placement.diffToNext > 0 && damaPoints < placement.diffToNext && riichiPoints >= placement.diffToNext) {
    score += 40;
    reasons.push("立直后的打点更接近或达到顺位逆转需求。");
  }
  if (placement.isFinalOrNearFinal && placement.selfRank === 1) {
    const penalty = placement.leadOverSecond >= 12000 ? 70 : 40;
    score -= penalty;
    reasons.push("终局附近处于领先，立直会降低防守弹性。");
  }
  return score;
}

function evaluateRisk(activeThreatCount: number, remainingTurns: number, reasons: string[]): number {
  let score = 0;
  if (remainingTurns <= 1) {
    reasons.push("剩余巡目极少，立直收益不足以覆盖宣言代价。");
    return -100;
  }
  if (remainingTurns <= 3) {
    score -= 20;
    reasons.push("剩余巡目偏少，立直后可利用的和牌机会有限。");
  }
  if (activeThreatCount === 1) {
    score -= 30;
    reasons.push("已有对手明显进攻，立直后的锁手风险上升。");
  } else if (activeThreatCount >= 2) {
    score -= 60;
    reasons.push("多个对手明显进攻，立直风险较高。");
  }
  return score;
}

function estimateTenpaiImprovement(
  handAfterDiscard: readonly TileId[],
  candidate: DiscardCandidate,
  context: NanikiruContext,
  baseline: {
    currentDamaPoints: number;
    currentRiichiPoints: number;
  },
): ImprovementSummary {
  const cacheKey = getImprovementCacheKey(handAfterDiscard, candidate, context, baseline);
  const cached = TENPAI_IMPROVEMENT_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  let improvementTiles = 0;
  let shapeImprovementTiles = 0;
  let valueImprovementTiles = 0;
  let drawTypes = 0;
  let bestImprovedWaits = 0;
  let bestImprovedDamaPoints = 0;
  const improvementDraws: TileId[] = [];
  const valueImprovementDraws: TileId[] = [];
  const mode = isMenzen(context) ? 0 : 1;
  const currentWaits = new Set(candidate.waits.map((wait) => wait.id));

  for (const draw of TILES_34) {
    if (draw === candidate.discard || currentWaits.has(draw)) {
      continue;
    }
    const remaining = estimateRemaining(draw, handAfterDiscard, context);
    if (remaining <= 0) {
      continue;
    }
    const analysis = analyzeTiles([...handAfterDiscard, draw], mode, { includeShantenBack: true });
    if (analysis.kind !== "discard") {
      continue;
    }
    const tenpaiDiscards = analysis.discards.filter((discard) => discard.shanten === 0);
    const shapeImproved = tenpaiDiscards.some((discard) => (
        discard.total_waits > candidate.totalWaits
        || discard.good_shape_count > candidate.goodShapeCount
    ));
    const valueEstimate = estimateBestImprovedValue(
      handAfterDiscard,
      draw,
      tenpaiDiscards,
      context,
      baseline,
    );
    const valueImproved = valueEstimate.improved;
    if (!shapeImproved && !valueImproved) {
      continue;
    }

    const bestTenpai = tenpaiDiscards
      .sort((a, b) => b.total_waits - a.total_waits || b.good_shape_count - a.good_shape_count)[0];
    improvementTiles += remaining;
    drawTypes += 1;
    improvementDraws.push(draw);
    if (shapeImproved) {
      shapeImprovementTiles += remaining;
    }
    if (valueImproved) {
      valueImprovementTiles += remaining;
      valueImprovementDraws.push(draw);
    }
    bestImprovedWaits = Math.max(bestImprovedWaits, bestTenpai?.total_waits ?? candidate.totalWaits);
    bestImprovedDamaPoints = Math.max(bestImprovedDamaPoints, valueEstimate.bestDamaPoints);
  }

  const result = {
    improvementTiles,
    drawTypes,
    improvementDraws,
    shapeImprovementTiles,
    valueImprovementTiles,
    valueImprovementDraws,
    bestImprovedWaits,
    bestImprovedDamaPoints,
  };
  TENPAI_IMPROVEMENT_CACHE.set(cacheKey, result);
  return result;
}

function estimateBestImprovedValue(
  handAfterDiscard: readonly TileId[],
  draw: TileId,
  tenpaiDiscards: readonly {
    discard: { id: TileId };
    shanten: number;
    waits: { id: TileId; remaining: number }[];
    total_waits: number;
    good_shape_count: number;
  }[],
  context: NanikiruContext,
  baseline: {
    currentDamaPoints: number;
    currentRiichiPoints: number;
  },
): { improved: boolean; bestDamaPoints: number; bestRiichiPoints: number } {
  let improved = false;
  let bestDamaPoints = 0;
  let bestRiichiPoints = 0;

  for (const tenpaiDiscard of tenpaiDiscards) {
    const improvedHand = removeOneTile([...handAfterDiscard, draw], tenpaiDiscard.discard.id);
    const pseudoCandidate: DiscardCandidate = {
      discard: tenpaiDiscard.discard.id,
      shanten: 0,
      waits: tenpaiDiscard.waits,
      totalWaits: tenpaiDiscard.total_waits,
      goodShapeCount: tenpaiDiscard.good_shape_count,
      goodShapeDraws: [],
    };
    const dama = summarizeWaitScores(improvedHand, pseudoCandidate, context, false);
    const riichi = summarizeWaitScores(improvedHand, pseudoCandidate, context, true);
    bestDamaPoints = Math.max(bestDamaPoints, dama.averagePoints);
    bestRiichiPoints = Math.max(bestRiichiPoints, riichi.averagePoints);
    if (
      (baseline.currentDamaPoints === 0 && dama.averagePoints > 0)
      || dama.averagePoints >= baseline.currentDamaPoints + 2000
      || riichi.averagePoints >= baseline.currentRiichiPoints + 2600
    ) {
      improved = true;
    }
  }

  return { improved, bestDamaPoints, bestRiichiPoints };
}

function estimateRemaining(tile: TileId, handAfterDiscard: readonly TileId[], context: NanikiruContext): number {
  const handVisible = handAfterDiscard.filter((item) => item === tile).length;
  const contextVisible = context.visibleTiles?.[TILE_INDEX[tile]] ?? 0;
  const visible = context.visibleTiles ? contextVisible : handVisible;
  return Math.max(0, 4 - visible);
}

function getImprovementCacheKey(
  handAfterDiscard: readonly TileId[],
  candidate: DiscardCandidate,
  context: NanikiruContext,
  baseline: {
    currentDamaPoints: number;
    currentRiichiPoints: number;
  },
): string {
  return JSON.stringify({
    hand: [...handAfterDiscard].sort(),
    waits: candidate.waits.map((wait) => [wait.id, wait.remaining]),
    totalWaits: candidate.totalWaits,
    goodShapeCount: candidate.goodShapeCount,
    visibleTiles: context.visibleTiles ?? null,
    menzen: isMenzen(context),
    currentDamaPoints: baseline.currentDamaPoints,
    currentRiichiPoints: baseline.currentRiichiPoints,
  });
}

function formatImprovementReason(improvement: ImprovementSummary, turnMultiplier: number): string {
  const turnPrefix = turnMultiplier >= 0.75
    ? "当前巡目仍有足够空间，"
    : turnMultiplier >= 0.35
      ? "当前仍有一定巡目，"
      : "当前巡目偏后，";
  if (improvement.shapeImprovementTiles >= 8) {
    if (improvement.valueImprovementTiles > 0) {
      return `${turnPrefix}低打点窄听仍有较多默听形状改良，且存在打点改良，立即立直的必要性明显下降。`;
    }
    return `${turnPrefix}低打点窄听仍有较多默听形状改良，立即立直的必要性明显下降。`;
  }
  return `${turnPrefix}低打点窄听仍有默听打点改良，立即立直的必要性下降。`;
}

function calculateHighValueNarrowImprovementPenalty(
  improvement: ImprovementSummary,
  riichiAveragePoints: number,
  turnMultiplier: number,
): number {
  const shapePenalty = Math.min(110, 95 + Math.max(0, improvement.shapeImprovementTiles - 8) * 3);
  const valueProtection = riichiAveragePoints >= 12000 ? 12 : riichiAveragePoints >= 8000 ? 6 : 0;
  return Math.max(0, Math.round((shapePenalty - valueProtection) * turnMultiplier));
}

function formatHighValueNarrowImprovementReason(improvement: ImprovementSummary, penalty: number): string {
  return `虽然当前立直打点较高，但早巡坏形窄听仍有 ${improvement.shapeImprovementTiles} 枚形状改良，和率提升空间明显，立即立直评价下调 ${penalty}。`;
}

function getImprovementTurnMultiplier(turn: number): number {
  if (turn <= 8) {
    return 1;
  }
  if (turn <= 11) {
    return 0.7;
  }
  if (turn <= 14) {
    return 0.35;
  }
  return 0;
}

function removeOneTile(tiles: readonly TileId[], tile: TileId): TileId[] {
  const result = [...tiles];
  const index = result.indexOf(tile);
  if (index >= 0) {
    result.splice(index, 1);
  }
  return result;
}

function buildPlacementSummary(context: NanikiruContext): PlacementSummary {
  const selfPoints = context.points ?? 25000;
  const standings = [
    { points: selfPoints, self: true },
    ...(context.opponents ?? []).map((opponent) => ({
      points: opponent.points ?? 25000,
      self: false,
    })),
  ].sort((a, b) => b.points - a.points);
  const selfIndex = standings.findIndex((item) => item.self);
  const nextPoints = selfIndex > 0 ? standings[selfIndex - 1]?.points ?? selfPoints : standings[1]?.points ?? selfPoints;
  const firstPoints = standings[0]?.points ?? selfPoints;
  const secondPoints = standings[1]?.points ?? selfPoints;

  return {
    selfRank: selfIndex >= 0 ? selfIndex + 1 : 1,
    diffToNext: Math.max(0, nextPoints - selfPoints),
    diffToFirst: Math.max(0, firstPoints - selfPoints),
    leadOverSecond: Math.max(0, selfPoints - secondPoints),
    isSouthRound: context.bakaze === "2z",
    isFinalOrNearFinal: context.bakaze === "2z" && (context.kyoku ?? 1) >= 3,
  };
}

function buildJudgment(input: {
  score: number;
  canRiichi: boolean;
  reasons: string[];
  details: RiichiJudgment["details"];
}): RiichiJudgment {
  const score = clamp(Math.round(input.score), -100, 100);
  const level = getRiichiLevel(score);
  return {
    canRiichi: input.canRiichi,
    shouldRiichi: input.canRiichi && score >= 30,
    score,
    level,
    levelText: formatRiichiLevel(level),
    confidence: getConfidence(score),
    reasons: input.reasons,
    details: input.details,
  };
}

function getRiichiLevel(score: number): RiichiLevel {
  if (score >= 70) {
    return "strong_recommend";
  }
  if (score >= 35) {
    return "recommend";
  }
  if (score > -20) {
    return "neutral";
  }
  if (score > -55) {
    return "discourage";
  }
  return "strong_discourage";
}

function formatRiichiLevel(level: RiichiLevel): string {
  if (level === "strong_recommend") {
    return "强烈建议立直";
  }
  if (level === "recommend") {
    return "建议立直";
  }
  if (level === "neutral") {
    return "可立可不立";
  }
  if (level === "discourage") {
    return "不太建议立直";
  }
  return "强烈反对立直";
}

function getConfidence(score: number): number {
  const distance = Math.abs(score - 30);
  return Math.round((0.55 + Math.min(0.4, distance / 175)) * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isMenzen(context: NanikiruContext): boolean {
  return (context.calls ?? []).every((call) => call.type === "ankan");
}

function isTerminalOrEdge(tile: TileId): boolean {
  return tile[1] !== "z" && (tile[0] === "1" || tile[0] === "2" || tile[0] === "8" || tile[0] === "9");
}

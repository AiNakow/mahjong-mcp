import { TILES_34, type TileId } from "../../core/tile.ts";
import { calculateAgariScore } from "../../scoring/index.ts";
import { analyzeTiles } from "../../hand/paili.ts";
import type { NanikiruPolicy } from "../nanikiru-policy.ts";
import { isOpenHand, type NanikiruContext } from "../nanikiru-context.ts";
import type { EvaluationPart } from "./evaluation.ts";
import type { TileInfo } from "../../hand/paili.ts";

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
  context: { shanten?: number; waits?: readonly TileInfo[]; context?: NanikiruContext } = {},
): EvaluationPart {
  const nanikiruContext = context.context ?? {};
  const routeScores = [
    evaluateTenpaiScoringRoute(afterDiscard, discard, policy, context),
    evaluateIishantenTwoLayerScoringRoute(afterDiscard, discard, policy, context),
    evaluateDoraRoute(afterDiscard, discard, policy, nanikiruContext),
    evaluateYakuhaiRoute(afterDiscard, discard, policy, nanikiruContext),
    evaluateTanyaoRoute(afterDiscard, discard, policy, nanikiruContext),
    evaluateChiitoiRoute(afterDiscard, discard, policy),
    evaluateHonitsuRoute(afterDiscard, discard, policy),
    evaluateIttsuRoute(afterDiscard, discard, policy),
    evaluateSanshokuRoute(afterDiscard, discard, policy),
    evaluateChantaRoute(afterDiscard, discard, policy),
    evaluateToitoiRoute(afterDiscard, discard, policy),
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

function evaluateIishantenTwoLayerScoringRoute(
  afterDiscard: readonly TileId[],
  discard: TileId,
  policy: NanikiruPolicy,
  context: { shanten?: number; waits?: readonly TileInfo[]; context?: NanikiruContext },
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
  context: { shanten?: number; waits?: readonly TileInfo[]; context?: NanikiruContext },
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

function evaluateDoraRoute(
  afterDiscard: readonly TileId[],
  discard: TileId,
  policy: NanikiruPolicy,
  context: NanikiruContext,
): ValueRouteScore {
  const doraTiles = (context.doraIndicators ?? []).map(nextDoraTile);
  const doraCount = afterDiscard.filter((tile) => doraTiles.includes(tile)).length;
  const doraSideCount = afterDiscard.filter((tile) => isDoraSide(tile, doraTiles)).length;
  const akaDoraCount = Math.max(
    0,
    (context.akaDoraCount ?? 0) - (isNumberFive(discard) ? 1 : 0),
  );
  const score = doraCount * policy.doraBonus
    + akaDoraCount * policy.akaDoraBonus
    + Math.min(2, doraSideCount) * policy.doraSideBonus;

  if (score <= 0) {
    return { route: "dora", score: 0, reasons: [] };
  }

  return {
    route: "dora",
    score,
    reasons: [{
      type: "value",
      polarity: "positive",
      priority: doraCount + akaDoraCount > 0 ? 74 : 48,
      message: doraCount + akaDoraCount > 0
        ? `保留 ${doraCount + akaDoraCount} 张宝牌/赤宝牌，打点潜力较高。`
        : "保留宝牌周边牌，后续打点改良空间较好。",
      data: {
        discard,
        doraTiles,
        doraCount,
        akaDoraCount,
        doraSideCount,
        primaryRoute: "dora",
      },
    }],
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

function evaluateYakuhaiRoute(
  afterDiscard: readonly TileId[],
  discard: TileId,
  policy: NanikiruPolicy,
  context: NanikiruContext,
): ValueRouteScore {
  const yakuhaiPairs = getYakuhaiPairs(afterDiscard, context);
  if (yakuhaiPairs.length === 0) {
    return { route: "yakuhai", score: 0, reasons: [] };
  }

  const tanyaoStrength = getTanyaoStrength(afterDiscard);
  const decay = 1 - tanyaoStrength * policy.yakuhaiTanyaoConflictDecay;
  const score = Math.round(policy.yakuhaiPairBonus * decay);

  return {
    route: "yakuhai",
    score,
    reasons: [
      {
      type: "value",
      polarity: "positive",
      priority: 70,
      message: tanyaoStrength >= 0.7
        ? `保留役牌对子 ${yakuhaiPairs.join("、")}，但手牌也接近断幺，役牌价值已折减。`
        : `保留役牌对子 ${yakuhaiPairs.join("、")}，有直接成役价值。`,
      data: { discard, yakuhaiPairs, tanyaoStrength, decay },
      },
    ],
  };
}

function evaluateTanyaoRoute(
  afterDiscard: readonly TileId[],
  discard: TileId,
  policy: NanikiruPolicy,
  context: NanikiruContext,
): ValueRouteScore {
  const tanyaoStrength = getTanyaoStrength(afterDiscard);
  if (tanyaoStrength <= 0) {
    return { route: "tanyao", score: 0, reasons: [] };
  }
  if (isOpenHand(context) && context.rules?.kuitan === false) {
    return { route: "tanyao", score: 0, reasons: [] };
  }

  const breakingYakuhaiPair = isBreakingYakuhaiPairForTanyao(afterDiscard, discard);
  const score = Math.round(policy.tanyaoLeanBonus * tanyaoStrength)
    + (breakingYakuhaiPair ? policy.breakYakuhaiPairForTanyaoBonus : 0);
  return {
    route: "tanyao",
    score,
    reasons: [
      {
      type: "value",
      polarity: "positive",
      priority: breakingYakuhaiPair ? 88 : 62,
      message: tanyaoStrength >= 1
        ? "手牌已接近完全断幺形，后续打点和副露灵活性较好。"
        : breakingYakuhaiPair
          ? "拆役牌对子后，手牌更接近断幺路线，延展性和副露空间更好。"
          : "手牌偏断幺，后续打点和副露灵活性较好。",
      data: {
        discard,
        tanyaoStrength,
        breakingYakuhaiPair,
        breakYakuhaiPairForTanyaoBonus: breakingYakuhaiPair
          ? policy.breakYakuhaiPairForTanyaoBonus
          : 0,
      },
      },
    ],
  };
}

function evaluateChiitoiRoute(
  afterDiscard: readonly TileId[],
  discard: TileId,
  policy: NanikiruPolicy,
): ValueRouteScore {
  const pairCount = countPairs(afterDiscard);
  if (pairCount < policy.chiitoiPairThreshold) {
    return { route: "chiitoi", score: 0, reasons: [] };
  }

  return {
    route: "chiitoi",
    score: policy.chiitoiBonus,
    reasons: [
      {
      type: "value",
      polarity: "positive",
      priority: 58,
      message: `对子达到 ${pairCount} 对，保留七对子路线。`,
      data: { discard, pairCount },
      },
    ],
  };
}

function evaluateHonitsuRoute(
  afterDiscard: readonly TileId[],
  discard: TileId,
  policy: NanikiruPolicy,
): ValueRouteScore {
  const honitsuSuit = getHonitsuLeanSuit(afterDiscard, policy.honitsuSuitThreshold);
  if (!honitsuSuit) {
    return { route: "honitsu", score: 0, reasons: [] };
  }

  return {
    route: "honitsu",
    score: policy.honitsuBonus,
    reasons: [
      {
      type: "value",
      polarity: "positive",
      priority: 56,
      message: `${formatSuit(honitsuSuit)}数量较集中，有染手潜力。`,
      data: { discard, suit: honitsuSuit },
      },
    ],
  };
}

function evaluateIttsuRoute(
  afterDiscard: readonly TileId[],
  discard: TileId,
  policy: NanikiruPolicy,
): ValueRouteScore {
  let best: { suit: "m" | "p" | "s"; score: number; complete: number; partial: number } | undefined;
  for (const suit of ["m", "p", "s"] as const) {
    const blocks = [
      getSequenceBlockStrength(afterDiscard, suit, 1),
      getSequenceBlockStrength(afterDiscard, suit, 4),
      getSequenceBlockStrength(afterDiscard, suit, 7),
    ];
    const complete = blocks.filter((block) => block === 2).length;
    const partial = blocks.filter((block) => block === 1).length;
    const raw = complete * 2 + partial;

    if (complete >= 1 && complete + partial >= 3 && raw >= 4 && (!best || raw > best.score)) {
      best = { suit, score: raw, complete, partial };
    }
  }

  if (!best) {
    return { route: "ittsu", score: 0, reasons: [] };
  }

  const score = Math.round(policy.ittsuBonus * Math.min(1, best.score / 6));
  return {
    route: "ittsu",
    score,
    reasons: [{
      type: "value",
      polarity: "positive",
      priority: 54,
      message: `${formatSuit(best.suit)}的一气通贯路线较清晰。`,
      data: { discard, suit: best.suit, completeBlocks: best.complete, partialBlocks: best.partial },
    }],
  };
}

function evaluateSanshokuRoute(
  afterDiscard: readonly TileId[],
  discard: TileId,
  policy: NanikiruPolicy,
): ValueRouteScore {
  let best: { start: number; score: number; complete: number; partial: number } | undefined;
  for (let start = 1; start <= 7; start += 1) {
    const blocks = (["m", "p", "s"] as const).map((suit) => getSequenceBlockStrength(afterDiscard, suit, start));
    const complete = blocks.filter((block) => block === 2).length;
    const partial = blocks.filter((block) => block === 1).length;
    const raw = complete * 2 + partial;

    if (complete >= 1 && complete + partial >= 3 && raw >= 4 && (!best || raw > best.score)) {
      best = { start, score: raw, complete, partial };
    }
  }

  if (!best) {
    return { route: "sanshoku", score: 0, reasons: [] };
  }

  const score = Math.round(policy.sanshokuBonus * Math.min(1, best.score / 6));
  return {
    route: "sanshoku",
    score,
    reasons: [{
      type: "value",
      polarity: "positive",
      priority: 53,
      message: `${best.start}${best.start + 1}${best.start + 2} 的三色同顺路线较清晰。`,
      data: {
        discard,
        sequence: `${best.start}${best.start + 1}${best.start + 2}`,
        completeBlocks: best.complete,
        partialBlocks: best.partial,
      },
    }],
  };
}

function evaluateChantaRoute(
  afterDiscard: readonly TileId[],
  discard: TileId,
  policy: NanikiruPolicy,
): ValueRouteScore {
  const terminalHonorCount = afterDiscard.filter(isTerminalOrHonor).length;
  if (terminalHonorCount < 5 || getTanyaoStrength(afterDiscard) > 0) {
    return { route: "chanta", score: 0, reasons: [] };
  }

  const chantaBlockCount = countChantaBlocks(afterDiscard);
  if (chantaBlockCount < 3) {
    return { route: "chanta", score: 0, reasons: [] };
  }

  const score = Math.round(policy.chantaBonus * Math.min(1, chantaBlockCount / 5));
  return {
    route: "chanta",
    score,
    reasons: [{
      type: "value",
      polarity: "positive",
      priority: 50,
      message: "幺九相关面子和搭子较多，有全带路线潜力。",
      data: { discard, terminalHonorCount, chantaBlockCount },
    }],
  };
}

function evaluateToitoiRoute(
  afterDiscard: readonly TileId[],
  discard: TileId,
  policy: NanikiruPolicy,
): ValueRouteScore {
  const counts = countTileIds(afterDiscard);
  const pairCount = [...counts.values()].filter((count) => count >= 2).length;
  const tripletCount = [...counts.values()].filter((count) => count >= 3).length;
  const blockScore = tripletCount * 2 + Math.max(0, pairCount - tripletCount);

  if (tripletCount === 0 || pairCount < 3 || blockScore < 4) {
    return { route: "toitoi", score: 0, reasons: [] };
  }

  const score = Math.round(policy.toitoiBonus * Math.min(1, blockScore / 6));
  return {
    route: "toitoi",
    score,
    reasons: [{
      type: "value",
      polarity: "positive",
      priority: 52,
      message: "对子和刻子较多，有对对和路线潜力。",
      data: { discard, pairCount, tripletCount, blockScore },
    }],
  };
}

function countPairs(tiles: readonly TileId[]): number {
  const counts = countTileIds(tiles);
  return [...counts.values()].filter((count) => count >= 2).length;
}

function removeOneTile(tiles: readonly TileId[], tile: TileId): TileId[] {
  const result = [...tiles];
  const index = result.indexOf(tile);
  if (index >= 0) {
    result.splice(index, 1);
  }
  return result;
}

function getYakuhaiPairs(tiles: readonly TileId[], context: NanikiruContext): TileId[] {
  const counts = countTileIds(tiles);
  const yakuhaiTiles = new Set<TileId>(["5z", "6z", "7z"]);
  if (context.bakaze) {
    yakuhaiTiles.add(context.bakaze);
  }
  if (context.seatWind) {
    yakuhaiTiles.add(context.seatWind);
  }
  return [...yakuhaiTiles].filter((tile) => (counts.get(tile) ?? 0) >= 2);
}

function getTanyaoStrength(tiles: readonly TileId[]): number {
  const terminalHonorCount = tiles.filter(isTerminalOrHonor).length;
  if (terminalHonorCount === 0) {
    return 1;
  }
  if (terminalHonorCount <= 2) {
    const terminalHonorPairs = getTerminalHonorPairCount(tiles);
    return terminalHonorPairs > 0 ? 0.35 : 0.7;
  }
  return 0;
}

function getTerminalHonorPairCount(tiles: readonly TileId[]): number {
  const counts = countTileIds(tiles);
  let pairs = 0;
  for (const [tile, count] of counts) {
    if (count >= 2 && isTerminalOrHonor(tile)) {
      pairs += 1;
    }
  }
  return pairs;
}

function isBreakingYakuhaiPairForTanyao(afterDiscard: readonly TileId[], discard: TileId): boolean {
  if (discard !== "5z" && discard !== "6z" && discard !== "7z") {
    return false;
  }

  const counts = countTileIds(afterDiscard);
  return (counts.get(discard) ?? 0) === 1 && getTanyaoStrength(afterDiscard) >= 0.7;
}

function getHonitsuLeanSuit(tiles: readonly TileId[], threshold: number): "m" | "p" | "s" | undefined {
  const suits = {
    m: 0,
    p: 0,
    s: 0,
  };
  let numberTileCount = 0;

  for (const tile of tiles) {
    const suit = tile[1];
    if (suit === "m" || suit === "p" || suit === "s") {
      suits[suit] += 1;
      numberTileCount += 1;
    }
  }

  for (const suit of ["m", "p", "s"] as const) {
    const offSuitCount = numberTileCount - suits[suit];
    if (suits[suit] >= threshold && offSuitCount <= 2) {
      return suit;
    }
  }

  return undefined;
}

function getSequenceBlockStrength(tiles: readonly TileId[], suit: "m" | "p" | "s", start: number): 0 | 1 | 2 {
  const counts = countTileIds(tiles);
  const first = `${start}${suit}` as TileId;
  const second = `${start + 1}${suit}` as TileId;
  const third = `${start + 2}${suit}` as TileId;
  const hasFirst = (counts.get(first) ?? 0) > 0;
  const hasSecond = (counts.get(second) ?? 0) > 0;
  const hasThird = (counts.get(third) ?? 0) > 0;

  if (hasFirst && hasSecond && hasThird) {
    return 2;
  }
  if ((hasFirst && hasSecond) || (hasSecond && hasThird) || (hasFirst && hasThird)) {
    return 1;
  }
  return 0;
}

function countChantaBlocks(tiles: readonly TileId[]): number {
  const counts = countTileIds(tiles);
  let blocks = 0;

  for (const [tile, count] of counts) {
    if (count >= 2 && isTerminalOrHonor(tile)) {
      blocks += 1;
    }
  }

  for (const suit of ["m", "p", "s"] as const) {
    for (const start of [1, 7]) {
      blocks += getSequenceBlockStrength(tiles, suit, start);
    }
  }

  return blocks;
}

function countTileIds(tiles: readonly TileId[]): Map<TileId, number> {
  const counts = new Map<TileId, number>();
  for (const tile of tiles) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  return counts;
}

function isTerminalOrHonor(tile: TileId): boolean {
  return tile[1] === "z" || tile[0] === "1" || tile[0] === "9";
}

function isNumberFive(tile: TileId): boolean {
  return tile[1] !== "z" && tile[0] === "5";
}

function isDoraSide(tile: TileId, doraTiles: readonly TileId[]): boolean {
  if (tile[1] === "z") {
    return false;
  }
  const rank = Number(tile[0]);
  return doraTiles.some((dora) => (
    dora[1] === tile[1]
    && dora[1] !== "z"
    && Math.abs(Number(dora[0]) - rank) === 1
  ));
}

function nextDoraTile(indicator: TileId): TileId {
  const suit = indicator[1];
  const rank = Number(indicator[0]);
  if (suit === "z") {
    if (rank >= 1 && rank <= 4) {
      return TILES_34[27 + (rank % 4)];
    }
    return ({ 5: "6z", 6: "7z", 7: "5z" } as Record<number, TileId>)[rank];
  }
  const nextRank = rank === 9 ? 1 : rank + 1;
  return `${nextRank}${suit}` as TileId;
}

function formatSuit(suit: "m" | "p" | "s"): string {
  if (suit === "m") {
    return "万子";
  }
  if (suit === "p") {
    return "饼子";
  }
  return "索子";
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
  if (route === "chanta") {
    return "全带路线";
  }
  return "对对和路线";
}

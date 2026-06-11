import type { TileId } from "../core/tile.ts";
import type { Reason } from "./reason.ts";
import type { CandidateFeature } from "./features.ts";
import {
  countPairsFromCounts,
  isDoraSide,
  isTerminalOrHonor,
} from "./features.ts";
import type { NanikiruContext } from "./nanikiru-context.ts";
import { isOpenHand } from "./nanikiru-context.ts";
import type { NanikiruPolicy } from "./nanikiru-policy.ts";

export type RouteId =
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

export interface RouteEvaluation {
  id: RouteId;
  strength: number;
  value: number;
  speedImpact: number;
  flexibility: number;
  requiredTiles: TileId[];
  conflictTags: string[];
  synergyTags: string[];
  reasons: Reason[];
  data?: Record<string, unknown>;
}

export interface RouteLine {
  ids: RouteId[];
  expectedHan: number;
  expectedPoints: number;
  speed: number;
  stability: number;
  requiredCommitment: number;
  score: number;
}

export interface RoutePortfolio {
  routes: RouteEvaluation[];
  lines: RouteLine[];
  bestLine?: RouteLine;
  conflicts: Array<{ routes: RouteId[]; penalty: number; reason: string }>;
}

export function evaluateRoutePortfolio(
  feature: CandidateFeature,
  policy: NanikiruPolicy,
  context: NanikiruContext = {},
): RoutePortfolio {
  const routes = [
    evaluateDoraRoute(feature, policy),
    evaluateYakuhaiRoute(feature, policy, context),
    evaluateTanyaoRoute(feature, policy, context),
    evaluateChiitoiRoute(feature, policy),
    evaluateHonitsuRoute(feature, policy),
    evaluateIttsuRoute(feature, policy),
    evaluateSanshokuRoute(feature, policy),
    evaluateChantaSanshokuRoute(feature, policy),
    evaluateChantaRoute(feature, policy),
    evaluateToitoiRoute(feature, policy),
  ].filter((route): route is RouteEvaluation => route !== undefined && route.value > 0)
    .sort((a, b) => b.value - a.value);

  const lines = buildRouteLines(routes, feature);
  return {
    routes,
    lines,
    bestLine: lines[0],
    conflicts: buildRouteConflicts(routes),
  };
}

function evaluateDoraRoute(feature: CandidateFeature, policy: NanikiruPolicy): RouteEvaluation | undefined {
  const doraCount = feature.tiles.doraCount;
  const akaDoraCount = feature.tiles.akaDoraCount;
  const doraSideCount = feature.tiles.doraSideCount;
  const value = doraCount * policy.doraBonus
    + akaDoraCount * policy.akaDoraBonus
    + Math.min(2, doraSideCount) * policy.doraSideBonus;
  if (value <= 0) {
    return undefined;
  }

  return {
    id: "dora",
    strength: Math.min(1, (doraCount + akaDoraCount) / 2 + Math.min(2, doraSideCount) * 0.1),
    value,
    speedImpact: 0,
    flexibility: doraSideCount > 0 ? 0.2 : 0,
    requiredTiles: feature.tiles.doraTiles,
    conflictTags: [],
    synergyTags: ["value"],
    reasons: [{
      type: "value",
      polarity: "positive",
      priority: doraCount + akaDoraCount > 0 ? 74 : 48,
      message: doraCount + akaDoraCount > 0
        ? `保留 ${doraCount + akaDoraCount} 张宝牌/赤宝牌，打点潜力较高。`
        : "保留宝牌周边牌，后续打点改良空间较好。",
      data: {
        discard: feature.discard,
        doraTiles: feature.tiles.doraTiles,
        doraCount,
        akaDoraCount,
        doraSideCount,
        primaryRoute: "dora",
      },
    }],
  };
}

function evaluateYakuhaiRoute(
  feature: CandidateFeature,
  policy: NanikiruPolicy,
  context: NanikiruContext,
): RouteEvaluation | undefined {
  const yakuhaiPairs = feature.tiles.yakuhaiPairs;
  if (yakuhaiPairs.length === 0) {
    return undefined;
  }

  const tanyaoStrength = getTanyaoStrength(feature.afterDiscard);
  const decay = 1 - tanyaoStrength * policy.yakuhaiTanyaoConflictDecay;
  const value = Math.round(policy.yakuhaiPairBonus * decay);
  return {
    id: "yakuhai",
    strength: Math.min(1, 0.65 + yakuhaiPairs.length * 0.15),
    value,
    speedImpact: isOpenHand(context) ? 0.2 : 0,
    flexibility: 0.2,
    requiredTiles: yakuhaiPairs,
    conflictTags: tanyaoStrength >= 0.7 ? ["tanyao"] : [],
    synergyTags: ["open"],
    reasons: [{
      type: "value",
      polarity: "positive",
      priority: 70,
      message: tanyaoStrength >= 0.7
        ? `保留役牌对子 ${yakuhaiPairs.join("、")}，但手牌也接近断幺，役牌价值已折减。`
        : `保留役牌对子 ${yakuhaiPairs.join("、")}，有直接成役价值。`,
      data: { discard: feature.discard, yakuhaiPairs, tanyaoStrength, decay },
    }],
  };
}

function evaluateTanyaoRoute(
  feature: CandidateFeature,
  policy: NanikiruPolicy,
  context: NanikiruContext,
): RouteEvaluation | undefined {
  const tanyaoStrength = getTanyaoStrength(feature.afterDiscard);
  if (tanyaoStrength <= 0 || (isOpenHand(context) && context.rules?.kuitan === false)) {
    return undefined;
  }

  const breakingYakuhaiPair = isBreakingYakuhaiPairForTanyao(feature);
  const value = Math.round(policy.tanyaoLeanBonus * tanyaoStrength)
    + (breakingYakuhaiPair ? policy.breakYakuhaiPairForTanyaoBonus : 0);
  return {
    id: "tanyao",
    strength: tanyaoStrength,
    value,
    speedImpact: 0.2,
    flexibility: 0.4,
    requiredTiles: [],
    conflictTags: ["chanta"],
    synergyTags: ["open", "speed"],
    reasons: [{
      type: "value",
      polarity: "positive",
      priority: breakingYakuhaiPair ? 88 : 62,
      message: tanyaoStrength >= 1
        ? "手牌已接近完全断幺形，后续打点和副露灵活性较好。"
        : breakingYakuhaiPair
          ? "拆役牌对子后，手牌更接近断幺路线，延展性和副露空间更好。"
          : "手牌偏断幺，后续打点和副露灵活性较好。",
      data: {
        discard: feature.discard,
        tanyaoStrength,
        breakingYakuhaiPair,
        breakYakuhaiPairForTanyaoBonus: breakingYakuhaiPair
          ? policy.breakYakuhaiPairForTanyaoBonus
          : 0,
      },
    }],
  };
}

function evaluateChiitoiRoute(feature: CandidateFeature, policy: NanikiruPolicy): RouteEvaluation | undefined {
  const pairCount = feature.blocks.pairCount;
  if (pairCount < policy.chiitoiPairThreshold) {
    return undefined;
  }

  return {
    id: "chiitoi",
    strength: Math.min(1, (pairCount - 2) / 4),
    value: policy.chiitoiBonus,
    speedImpact: -0.1,
    flexibility: pairCount >= 5 ? 0.25 : 0,
    requiredTiles: [...feature.counts].filter(([, count]) => count >= 2).map(([tile]) => tile),
    conflictTags: ["sequence"],
    synergyTags: feature.tiles.doraCount > 0 ? ["dora"] : [],
    reasons: [{
      type: "value",
      polarity: "positive",
      priority: 58,
      message: `对子达到 ${pairCount} 对，保留七对子路线。`,
      data: { discard: feature.discard, pairCount },
    }],
  };
}

function evaluateHonitsuRoute(feature: CandidateFeature, policy: NanikiruPolicy): RouteEvaluation | undefined {
  const honitsuSuit = getHonitsuLeanSuit(feature.afterDiscard, policy.honitsuSuitThreshold);
  if (!honitsuSuit) {
    return undefined;
  }

  return {
    id: "honitsu",
    strength: 1,
    value: policy.honitsuBonus,
    speedImpact: -0.15,
    flexibility: 0.1,
    requiredTiles: feature.afterDiscard.filter((tile) => tile[1] === honitsuSuit || tile[1] === "z"),
    conflictTags: [],
    synergyTags: ["yakuhai", "chiitoi"],
    reasons: [{
      type: "value",
      polarity: "positive",
      priority: 56,
      message: `${formatSuit(honitsuSuit)}数量较集中，有染手潜力。`,
      data: { discard: feature.discard, suit: honitsuSuit },
    }],
  };
}

function evaluateIttsuRoute(feature: CandidateFeature, policy: NanikiruPolicy): RouteEvaluation | undefined {
  let best: { suit: "m" | "p" | "s"; raw: number; complete: number; partial: number } | undefined;
  for (const suit of ["m", "p", "s"] as const) {
    const blocks = [1, 4, 7].map((start) => getSequenceBlockStrength(feature.afterDiscard, suit, start));
    const complete = blocks.filter((block) => block === 2).length;
    const partial = blocks.filter((block) => block === 1).length;
    const raw = complete * 2 + partial;
    if (complete >= 1 && complete + partial >= 3 && raw >= 4 && (!best || raw > best.raw)) {
      best = { suit, raw, complete, partial };
    }
  }
  if (!best) {
    return undefined;
  }

  const value = Math.round(policy.ittsuBonus * Math.min(1, best.raw / 6));
  return {
    id: "ittsu",
    strength: Math.min(1, best.raw / 6),
    value,
    speedImpact: -0.05,
    flexibility: 0.05,
    requiredTiles: feature.afterDiscard.filter((tile) => tile[1] === best.suit),
    conflictTags: [],
    synergyTags: ["riichi"],
    reasons: [{
      type: "value",
      polarity: "positive",
      priority: 54,
      message: `${formatSuit(best.suit)}的一气通贯路线较清晰。`,
      data: { discard: feature.discard, suit: best.suit, completeBlocks: best.complete, partialBlocks: best.partial },
    }],
  };
}

function evaluateSanshokuRoute(feature: CandidateFeature, policy: NanikiruPolicy): RouteEvaluation | undefined {
  const best = getBestSanshoku(feature.afterDiscard);
  if (!best) {
    return undefined;
  }

  const value = Math.round(policy.sanshokuBonus * Math.min(1, best.raw / 6));
  return {
    id: "sanshoku",
    strength: Math.min(1, best.raw / 6),
    value,
    speedImpact: -0.05,
    flexibility: 0.05,
    requiredTiles: [],
    conflictTags: [],
    synergyTags: best.start === 1 || best.start === 7 ? ["chanta"] : ["riichi"],
    reasons: [{
      type: "value",
      polarity: "positive",
      priority: 53,
      message: `${best.start}${best.start + 1}${best.start + 2} 的三色同顺路线较清晰。`,
      data: {
        discard: feature.discard,
        sequence: `${best.start}${best.start + 1}${best.start + 2}`,
        completeBlocks: best.complete,
        partialBlocks: best.partial,
      },
    }],
  };
}

function evaluateChantaSanshokuRoute(feature: CandidateFeature, policy: NanikiruPolicy): RouteEvaluation | undefined {
  const composite = getChantaSanshokuComposite(feature.afterDiscard);
  if (!composite) {
    return undefined;
  }

  const value = Math.round(policy.compositeRouteBonus * composite.strength);
  return {
    id: "chanta_sanshoku",
    strength: composite.strength,
    value,
    speedImpact: -0.2,
    flexibility: -0.1,
    requiredTiles: [],
    conflictTags: ["tanyao", "chiitoi"],
    synergyTags: ["chanta", "sanshoku", "riichi"],
    reasons: [{
      type: "value",
      polarity: "positive",
      priority: 69,
      message: `${composite.sequence} 的三色同顺与全带可以复合，打点路线更厚。`,
      data: {
        discard: feature.discard,
        primaryRoute: "chanta_sanshoku",
        sequence: composite.sequence,
        sanshokuStrength: composite.sanshokuStrength,
        chantaStrength: composite.chantaStrength,
      },
    }],
  };
}

function evaluateChantaRoute(feature: CandidateFeature, policy: NanikiruPolicy): RouteEvaluation | undefined {
  if (feature.tiles.terminalHonorCount < 5 || getTanyaoStrength(feature.afterDiscard) > 0) {
    return undefined;
  }

  const chantaBlockCount = countChantaBlocks(feature.afterDiscard);
  if (chantaBlockCount < 3) {
    return undefined;
  }

  const value = Math.round(policy.chantaBonus * Math.min(1, chantaBlockCount / 5));
  return {
    id: "chanta",
    strength: Math.min(1, chantaBlockCount / 5),
    value,
    speedImpact: -0.15,
    flexibility: -0.05,
    requiredTiles: feature.afterDiscard.filter(isTerminalOrHonor),
    conflictTags: ["tanyao"],
    synergyTags: ["sanshoku", "yakuhai"],
    reasons: [{
      type: "value",
      polarity: "positive",
      priority: 50,
      message: "幺九相关面子和搭子较多，有全带路线潜力。",
      data: { discard: feature.discard, terminalHonorCount: feature.tiles.terminalHonorCount, chantaBlockCount },
    }],
  };
}

function evaluateToitoiRoute(feature: CandidateFeature, policy: NanikiruPolicy): RouteEvaluation | undefined {
  const pairCount = feature.blocks.pairCount;
  const tripletCount = feature.blocks.tripletCount;
  const blockScore = tripletCount * 2 + Math.max(0, pairCount - tripletCount);
  if (tripletCount === 0 || pairCount < 3 || blockScore < 4) {
    return undefined;
  }

  const value = Math.round(policy.toitoiBonus * Math.min(1, blockScore / 6));
  return {
    id: "toitoi",
    strength: Math.min(1, blockScore / 6),
    value,
    speedImpact: -0.1,
    flexibility: 0,
    requiredTiles: [...feature.counts].filter(([, count]) => count >= 2).map(([tile]) => tile),
    conflictTags: ["sequence"],
    synergyTags: ["yakuhai"],
    reasons: [{
      type: "value",
      polarity: "positive",
      priority: 52,
      message: "对子和刻子较多，有对对和路线潜力。",
      data: { discard: feature.discard, pairCount, tripletCount, blockScore },
    }],
  };
}

function buildRouteLines(routes: readonly RouteEvaluation[], feature: CandidateFeature): RouteLine[] {
  const singleRouteLines = routes.map((route) => ({
    ids: [route.id],
    expectedHan: estimateRouteHan(route.id),
    expectedPoints: route.value * 100,
    speed: feature.totalWaits + route.speedImpact * 10,
    stability: route.strength + route.flexibility,
    requiredCommitment: Math.max(0, -route.flexibility),
    score: route.value + route.strength * 20 + route.speedImpact * 10,
  }));

  const compositeLines: RouteLine[] = [];
  const hasChantaSanshoku = routes.some((route) => route.id === "chanta_sanshoku");
  for (let index = 0; index < routes.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < routes.length; otherIndex += 1) {
      const first = routes[index];
      const second = routes[otherIndex];
      if (!first || !second || !canCombineRoutes(first, second, hasChantaSanshoku)) {
        continue;
      }
      compositeLines.push(buildCompositeRouteLine(first, second, feature));
    }
  }

  return [...singleRouteLines, ...compositeLines].sort((a, b) => b.score - a.score);
}

function canCombineRoutes(first: RouteEvaluation, second: RouteEvaluation, hasChantaSanshoku: boolean): boolean {
  if (
    first.conflictTags.includes(second.id)
    || second.conflictTags.includes(first.id)
    || first.id === "chanta_sanshoku"
    || second.id === "chanta_sanshoku"
  ) {
    return false;
  }
  if (hasChantaSanshoku && isChantaSanshokuPair(first.id, second.id)) {
    return false;
  }
  return first.synergyTags.includes(second.id)
    || second.synergyTags.includes(first.id)
    || first.id === "dora"
    || second.id === "dora";
}

function buildCompositeRouteLine(
  first: RouteEvaluation,
  second: RouteEvaluation,
  feature: CandidateFeature,
): RouteLine {
  const speedImpact = first.speedImpact + second.speedImpact;
  const flexibility = first.flexibility + second.flexibility;
  const value = first.value + second.value;
  const strength = (first.strength + second.strength) / 2;
  return {
    ids: [first.id, second.id],
    expectedHan: estimateRouteHan(first.id) + estimateRouteHan(second.id),
    expectedPoints: value * 100,
    speed: feature.totalWaits + speedImpact * 10,
    stability: strength + flexibility,
    requiredCommitment: Math.max(0, -flexibility),
    score: value + strength * 24 + speedImpact * 8 + 12,
  };
}

function isChantaSanshokuPair(first: RouteId, second: RouteId): boolean {
  return (first === "chanta" && second === "sanshoku")
    || (first === "sanshoku" && second === "chanta");
}

function buildRouteConflicts(routes: readonly RouteEvaluation[]): Array<{ routes: RouteId[]; penalty: number; reason: string }> {
  const result: Array<{ routes: RouteId[]; penalty: number; reason: string }> = [];
  for (const route of routes) {
    for (const other of routes) {
      if (route === other || !route.conflictTags.includes(other.id)) {
        continue;
      }
      result.push({
        routes: [route.id, other.id],
        penalty: Math.round(Math.min(route.value, other.value) * 0.25),
        reason: `${formatRoute(route.id)} 与 ${formatRoute(other.id)} 路线冲突。`,
      });
    }
  }
  return result;
}

function estimateRouteHan(route: RouteId): number {
  if (route === "chanta_sanshoku") {
    return 4;
  }
  if (route === "honitsu") {
    return 3;
  }
  if (route === "chiitoi" || route === "chanta" || route === "sanshoku" || route === "ittsu" || route === "toitoi") {
    return 2;
  }
  return 1;
}

function getTanyaoStrength(tiles: readonly TileId[]): number {
  const terminalHonorCount = tiles.filter(isTerminalOrHonor).length;
  if (terminalHonorCount === 0) {
    return 1;
  }
  if (terminalHonorCount <= 2) {
    return getTerminalHonorPairCount(tiles) > 0 ? 0.35 : 0.7;
  }
  return 0;
}

function isBreakingYakuhaiPairForTanyao(feature: CandidateFeature): boolean {
  if (feature.discard !== "5z" && feature.discard !== "6z" && feature.discard !== "7z") {
    return false;
  }
  return (feature.counts.get(feature.discard) ?? 0) === 1 && getTanyaoStrength(feature.afterDiscard) >= 0.7;
}

function getHonitsuLeanSuit(tiles: readonly TileId[], threshold: number): "m" | "p" | "s" | undefined {
  const suits = { m: 0, p: 0, s: 0 };
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

function getBestSanshoku(tiles: readonly TileId[]): { start: number; raw: number; complete: number; partial: number } | undefined {
  let best: { start: number; raw: number; complete: number; partial: number } | undefined;
  for (let start = 1; start <= 7; start += 1) {
    const blocks = (["m", "p", "s"] as const).map((suit) => getSequenceBlockStrength(tiles, suit, start));
    const complete = blocks.filter((block) => block === 2).length;
    const partial = blocks.filter((block) => block === 1).length;
    const raw = complete * 2 + partial;
    if (complete >= 1 && complete + partial >= 3 && raw >= 4 && (!best || raw > best.raw)) {
      best = { start, raw, complete, partial };
    }
  }
  return best;
}

function getChantaSanshokuComposite(
  tiles: readonly TileId[],
): { sequence: string; strength: number; sanshokuStrength: number; chantaStrength: number } | undefined {
  const chantaBlockCount = countChantaBlocks(tiles);
  const terminalHonorCount = tiles.filter(isTerminalOrHonor).length;
  if (chantaBlockCount < 4 || terminalHonorCount < 5) {
    return undefined;
  }

  let best: { sequence: string; strength: number; sanshokuStrength: number; chantaStrength: number } | undefined;
  for (const start of [1, 7]) {
    const blocks = (["m", "p", "s"] as const).map((suit) => getSequenceBlockStrength(tiles, suit, start));
    const complete = blocks.filter((block) => block === 2).length;
    const partial = blocks.filter((block) => block === 1).length;
    const raw = complete * 2 + partial;
    if (complete < 1 || complete + partial < 3 || raw < 4) {
      continue;
    }

    const sanshokuStrength = Math.min(1, raw / 6);
    const chantaStrength = Math.min(1, chantaBlockCount / 6);
    const strength = (sanshokuStrength + chantaStrength) / 2;
    const candidate = {
      sequence: `${start}${start + 1}${start + 2}`,
      strength,
      sanshokuStrength,
      chantaStrength,
    };
    if (!best || candidate.strength > best.strength) {
      best = candidate;
    }
  }

  return best;
}

function countChantaBlocks(tiles: readonly TileId[]): number {
  let blocks = 0;
  const counts = new Map<TileId, number>();
  for (const tile of tiles) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
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

function getSequenceBlockStrength(tiles: readonly TileId[], suit: "m" | "p" | "s", start: number): 0 | 1 | 2 {
  const first = `${start}${suit}` as TileId;
  const second = `${start + 1}${suit}` as TileId;
  const third = `${start + 2}${suit}` as TileId;
  const hasFirst = tiles.includes(first);
  const hasSecond = tiles.includes(second);
  const hasThird = tiles.includes(third);

  if (hasFirst && hasSecond && hasThird) {
    return 2;
  }
  if ((hasFirst && hasSecond) || (hasSecond && hasThird) || (hasFirst && hasThird)) {
    return 1;
  }
  return 0;
}

function getTerminalHonorPairCount(tiles: readonly TileId[]): number {
  const counts = new Map<TileId, number>();
  for (const tile of tiles) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  return [...counts].filter(([tile, count]) => count >= 2 && isTerminalOrHonor(tile)).length;
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

function formatRoute(route: RouteId): string {
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
  if (route === "chanta_sanshoku") {
    return "全带三色";
  }
  if (route === "chanta") {
    return "全带";
  }
  if (route === "toitoi") {
    return "对对和";
  }
  return "宝牌";
}

import { TILES_34, type TileId } from "../core/tile.ts";
import { analyzeTiles } from "../hand/paili.ts";
import type { TileInfo } from "../hand/paili.ts";
import type { Reason } from "./reason.ts";
import type { NanikiruContext } from "./nanikiru-context.ts";
import { isOpenHand } from "./nanikiru-context.ts";
import type { NanikiruPolicy } from "./nanikiru-policy.ts";
import {
  countTileIds,
  isDoraSide,
  nextDoraTile,
} from "./features.ts";
import type { CandidateFeature } from "./features.ts";
import { evaluateRoutePortfolio } from "./routes.ts";

export interface ImprovementEvaluation {
  score: number;
  reasons: Reason[];
}

interface ImprovementProfile {
  value: number;
  doraValue: number;
  routeValue: number;
  tenpaiValue: number;
}

export function evaluateSameShantenImprovement(
  feature: CandidateFeature | undefined,
  policy: NanikiruPolicy,
  context: NanikiruContext = {},
): ImprovementEvaluation {
  if (
    !feature
    || feature.shanten < 1
    || (context.turn ?? 99) > 8
    || hasActiveThreat(context)
    || !hasSameShantenImprovementSignal(feature, context, policy)
  ) {
    return { score: 0, reasons: [] };
  }

  const estimate = estimateSameShantenImprovement(feature, policy, context);
  if (estimate.weightedValue < policy.sameShantenImprovementMinValue || estimate.totalRemaining <= 0) {
    return { score: 0, reasons: [] };
  }

  const score = Math.round(estimate.weightedValue / policy.sameShantenImprovementValueDivisor);
  if (score <= 0) {
    return { score: 0, reasons: [] };
  }

  return {
    score,
    reasons: [{
      type: "value",
      polarity: "positive",
      priority: 63,
      message: `保留同向听高质量改良，最佳改良摸牌 ${estimate.bestDraw}。`,
      data: {
        discard: feature.discard,
        primaryRoute: "same_shanten_improvement",
        weightedValue: Math.round(estimate.weightedValue),
        bestDraw: estimate.bestDraw,
        bestGain: Math.round(estimate.bestGain),
        totalRemaining: estimate.totalRemaining,
      },
    }],
  };
}

function estimateSameShantenImprovement(
  feature: CandidateFeature,
  policy: NanikiruPolicy,
  context: NanikiruContext,
): { weightedValue: number; bestDraw?: TileId; bestGain: number; totalRemaining: number } {
  const mode = isOpenHand(context) ? 1 : 0;
  const currentProfile = getImprovementProfile(feature.afterDiscard, feature.shanten, context, policy, feature.waits);
  let weightedTotal = 0;
  let totalRemaining = 0;
  let bestDraw: TileId | undefined;
  let bestGain = 0;

  const draws = getSameShantenDraws(
    feature.afterDiscard,
    feature.shanten,
    mode,
    getImprovementDrawCandidates(context),
  )
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, policy.sameShantenImprovementMaxDrawTypes);

  for (const draw of draws) {
    const afterDraw = [...feature.afterDiscard, draw.id];
    const analysis = analyzeTiles(afterDraw, mode, { includeShantenBack: true });
    if (analysis.kind !== "discard") {
      continue;
    }

    let bestProfile: ImprovementProfile | undefined;
    for (const nextDiscard of analysis.discards.filter((item) => item.shanten === feature.shanten)) {
      const nextHand = removeOneTile(afterDraw, nextDiscard.discard.id);
      const profile = getImprovementProfile(nextHand, feature.shanten, context, policy, nextDiscard.waits);
      if (!bestProfile || profile.value > bestProfile.value) {
        bestProfile = profile;
      }
    }

    if (!bestProfile) {
      continue;
    }

    const gain = Math.max(0, bestProfile.value - currentProfile.value);
    if (gain <= 0) {
      continue;
    }

    weightedTotal += gain * draw.remaining;
    totalRemaining += draw.remaining;
    if (gain > bestGain) {
      bestGain = gain;
      bestDraw = draw.id;
    }
  }

  return {
    weightedValue: totalRemaining > 0 ? weightedTotal / totalRemaining : 0,
    bestDraw,
    bestGain,
    totalRemaining,
  };
}

function getSameShantenDraws(
  tiles: readonly TileId[],
  shanten: number,
  mode: 0 | 1,
  drawCandidates: readonly TileId[],
): TileInfo[] {
  const counts = countTileIds(tiles);
  const result: TileInfo[] = [];
  for (const tile of drawCandidates) {
    const count = counts.get(tile) ?? 0;
    if (count >= 4) {
      continue;
    }
    const analysis = analyzeTiles([...tiles, tile], mode, { includeShantenBack: true });
    if (analysis.kind === "discard" && analysis.discards.some((discard) => discard.shanten === shanten)) {
      result.push({ id: tile, remaining: 4 - count });
    }
  }
  return result.filter((draw) => draw.remaining > 0);
}

function hasSameShantenImprovementSignal(
  feature: CandidateFeature,
  context: NanikiruContext,
  policy: NanikiruPolicy,
): boolean {
  return (context.doraIndicators ?? []).length > 0
    || evaluateRoutePortfolio(feature, policy, context).routes.some((route) => route.id === "chanta_sanshoku");
}

function getImprovementDrawCandidates(context: NanikiruContext = {}): TileId[] {
  const doraTiles = (context.doraIndicators ?? []).map(nextDoraTile);
  if (doraTiles.length === 0) {
    return TILES_34.slice(0, 8);
  }

  const candidates = new Set<TileId>();
  for (const dora of doraTiles) {
    candidates.add(dora);
    if (dora[1] !== "z") {
      const rank = Number(dora[0]);
      if (rank > 1) {
        candidates.add(`${rank - 1}${dora[1]}` as TileId);
      }
      if (rank < 9) {
        candidates.add(`${rank + 1}${dora[1]}` as TileId);
      }
    }
  }
  return [...candidates];
}

function getImprovementProfile(
  tiles: readonly TileId[],
  shanten: number,
  context: NanikiruContext,
  policy: NanikiruPolicy,
  waits?: readonly TileInfo[],
): ImprovementProfile {
  const doraValue = getDoraImprovementValue(tiles, context);
  const routeValue = getCompositeRouteValue(tiles, context, policy);
  const tenpaiValue = shanten === 1 && waits ? Math.min(20, countWaits(waits) * 2) : 0;

  return {
    value: doraValue + routeValue + tenpaiValue,
    doraValue,
    routeValue,
    tenpaiValue,
  };
}

function getCompositeRouteValue(
  tiles: readonly TileId[],
  context: NanikiruContext,
  policy: NanikiruPolicy,
): number {
  const feature = {
    discard: "1m" as TileId,
    beforeDiscard: tiles,
    afterDiscard: tiles,
    shanten: 1,
    waits: [],
    totalWaits: 0,
    goodShapeCount: 0,
    goodShapeRatio: 0,
    goodShapeDraws: [],
    counts: countTileIds(tiles),
    shape: { ryanmen: 0, kanchan: 0, penchan: 0, complex: 0, isolatedTerminalOrHonor: 0 },
    blocks: {
      pairCount: 0,
      tripletCount: 0,
      ryanmenCount: 0,
      kanchanCount: 0,
      penchanCount: 0,
      complexShapeCount: 0,
    },
    tiles: {
      terminalHonorCount: tiles.filter((tile) => tile[1] === "z" || tile[0] === "1" || tile[0] === "9").length,
      simpleCount: 0,
      doraTiles: (context.doraIndicators ?? []).map(nextDoraTile),
      doraCount: 0,
      akaDoraCount: context.akaDoraCount ?? 0,
      doraSideCount: 0,
      yakuhaiPairs: [],
    },
  } satisfies CandidateFeature;
  return evaluateRoutePortfolio(feature, policy, context).routes.find((route) => route.id === "chanta_sanshoku")?.value ?? 0;
}

function getDoraImprovementValue(tiles: readonly TileId[], context: NanikiruContext): number {
  const doraTiles = (context.doraIndicators ?? []).map(nextDoraTile);
  if (doraTiles.length === 0) {
    return 0;
  }

  const counts = countTileIds(tiles);
  let value = 0;
  for (const dora of doraTiles) {
    const count = counts.get(dora) ?? 0;
    value += count * 35;
    if (count >= 2) {
      value += 35;
    }
  }

  const doraSideCount = tiles.filter((tile) => isDoraSide(tile, doraTiles)).length;
  return value + Math.min(2, doraSideCount) * 6;
}

function countWaits(waits: readonly TileInfo[]): number {
  return waits.reduce((total, wait) => total + wait.remaining, 0);
}

function hasActiveThreat(context: NanikiruContext): boolean {
  return (context.opponents ?? []).some((opponent) => opponent.riichi || opponent.ippatsu);
}

function removeOneTile(tiles: readonly TileId[], tile: TileId): TileId[] {
  const result = [...tiles];
  const index = result.indexOf(tile);
  if (index >= 0) {
    result.splice(index, 1);
  }
  return result;
}

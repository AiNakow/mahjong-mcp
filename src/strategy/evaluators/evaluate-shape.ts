import { TILE_INDEX, type TileId } from "../../core/tile.ts";
import type { DiscardCandidate } from "../../service/analyze.ts";
import type { NanikiruContext } from "../nanikiru-context.ts";
import type { EvaluationPart } from "./evaluation.ts";

export function evaluateShape(
  afterDiscard: readonly TileId[],
  candidate: DiscardCandidate,
  context: NanikiruContext = {},
): EvaluationPart {
  const reasons: EvaluationPart["reasons"] = [];
  let score = 0;

  if (candidate.waits.length >= 10) {
    score += 20;
    reasons.push({
      type: "shape",
      polarity: "positive",
      priority: 55,
      message: `进张种类达到 ${candidate.waits.length} 种，后续变化较宽。`,
      data: { waitKinds: candidate.waits.length },
    });
  }

  const pairCount = countPairs(afterDiscard);
  if (pairCount >= 2) {
    score += pairCount * 5;
    reasons.push({
      type: "shape",
      polarity: "positive",
      priority: 45,
      message: `保留 ${pairCount} 个对子，可作为雀头或变化来源。`,
      data: { pairCount },
    });
  }

  const shapeFeatures = extractShapeFeatures(afterDiscard, candidate.discard);
  score += shapeFeatures.ryanmen * 18;
  score += shapeFeatures.kanchan * 8;
  score += shapeFeatures.penchan * 4;
  score += shapeFeatures.complex * 22;
  score -= shapeFeatures.isolatedTerminalOrHonor * 10;

  if (shapeFeatures.ryanmen > 0) {
    reasons.push({
      type: "shape",
      polarity: "positive",
      priority: 68,
      message: formatRyanmenMessage(shapeFeatures.ryanmen),
      data: { ryanmen: shapeFeatures.ryanmen },
    });
  }

  if (shapeFeatures.complex > 0) {
    reasons.push({
      type: "shape",
      polarity: "positive",
      priority: 66,
      message: `保留 ${shapeFeatures.complex} 组复合形，后续变化更丰富。`,
      data: { complex: shapeFeatures.complex },
    });
  }

  if (shapeFeatures.kanchan > 0 || shapeFeatures.penchan > 0) {
    reasons.push({
      type: "shape",
      polarity: "neutral",
      priority: 38,
      message: `包含 ${shapeFeatures.kanchan} 组嵌张和 ${shapeFeatures.penchan} 组边张，仍有改良空间。`,
      data: {
        kanchan: shapeFeatures.kanchan,
        penchan: shapeFeatures.penchan,
      },
    });
  }

  if (shapeFeatures.isolatedTerminalOrHonor > 0) {
    reasons.push({
      type: "shape",
      polarity: "negative",
      priority: 48,
      message: `仍有 ${shapeFeatures.isolatedTerminalOrHonor} 张孤立幺九字牌，形状效率较低。`,
      data: { isolatedTerminalOrHonor: shapeFeatures.isolatedTerminalOrHonor },
    });
  }

  const blockEfficiency = evaluateBlockEfficiency(afterDiscard, candidate, context);
  score += blockEfficiency.score;
  reasons.push(...blockEfficiency.reasons);

  return { score, reasons };
}

export interface ShapeFeatures {
  ryanmen: number;
  kanchan: number;
  penchan: number;
  complex: number;
  isolatedTerminalOrHonor: number;
}

function formatRyanmenMessage(ryanmen: number): string {
  if (ryanmen >= 5) {
    return "保留多处两面延展，听牌质量较好。";
  }
  return `保留 ${ryanmen} 处两面延展，听牌质量较好。`;
}

export function extractShapeFeatures(tiles: readonly TileId[], discard?: TileId): ShapeFeatures {
  const suitCounts = getSuitCounts(tiles);
  let ryanmen = 0;
  let kanchan = 0;
  let penchan = 0;
  let complex = 0;

  for (const counts of Object.values(suitCounts)) {
    for (let rank = 1; rank <= 8; rank += 1) {
      if (counts[rank] > 0 && counts[rank + 1] > 0) {
        if (rank === 1 || rank === 8) {
          penchan += 1;
        } else {
          ryanmen += 1;
        }
      }
    }

    for (let rank = 1; rank <= 7; rank += 1) {
      if (counts[rank] > 0 && counts[rank + 2] > 0) {
        kanchan += 1;
      }
    }

    for (const pattern of COMPLEX_PATTERNS) {
      if (hasPattern(counts, pattern)) {
        complex += 1;
      }
    }
  }

  return {
    ryanmen,
    kanchan,
    penchan,
    complex,
    isolatedTerminalOrHonor: countIsolatedTerminalOrHonor(tiles, suitCounts, discard),
  };
}

const COMPLEX_PATTERNS = [
  [2, 3, 3, 4],
  [3, 4, 4, 5],
  [4, 5, 5, 6],
  [5, 6, 6, 7],
  [6, 7, 7, 8],
  [1, 1, 2, 3],
  [7, 8, 8, 9],
] as const;

function getSuitCounts(tiles: readonly TileId[]): Record<"m" | "p" | "s", number[]> {
  const counts = {
    m: Array(10).fill(0) as number[],
    p: Array(10).fill(0) as number[],
    s: Array(10).fill(0) as number[],
  };

  for (const tile of tiles) {
    const suit = tile[1];
    if (suit === "m" || suit === "p" || suit === "s") {
      counts[suit][Number(tile[0])] += 1;
    }
  }

  return counts;
}

function hasPattern(counts: readonly number[], pattern: readonly number[]): boolean {
  const needed = new Map<number, number>();
  for (const rank of pattern) {
    needed.set(rank, (needed.get(rank) ?? 0) + 1);
  }

  for (const [rank, count] of needed) {
    if (counts[rank] < count) {
      return false;
    }
  }

  return true;
}

function countPairs(tiles: readonly TileId[]): number {
  const counts = countTileIds(tiles);
  return [...counts.values()].filter((count) => count >= 2).length;
}

function countIsolatedTerminalOrHonor(
  tiles: readonly TileId[],
  suitCounts: Record<"m" | "p" | "s", number[]>,
  discard?: TileId,
): number {
  const counts = countTileIds(tiles);
  let isolated = 0;

  for (const tile of tiles) {
    if (isLeftoverFromBrokenYakuhaiPair(tile, discard, counts)) {
      continue;
    }

    if ((counts.get(tile) ?? 0) >= 2) {
      continue;
    }

    const suit = tile[1];
    const rank = Number(tile[0]);
    if (suit === "z") {
      isolated += 1;
      continue;
    }

    if ((rank === 1 || rank === 9) && !hasNearbyTile(suit as "m" | "p" | "s", rank, suitCounts)) {
      isolated += 1;
    }
  }

  return isolated;
}

function isLeftoverFromBrokenYakuhaiPair(
  tile: TileId,
  discard: TileId | undefined,
  counts: Map<TileId, number>,
): boolean {
  if (discard !== "5z" && discard !== "6z" && discard !== "7z") {
    return false;
  }
  return tile === discard && (counts.get(tile) ?? 0) === 1;
}

function hasNearbyTile(
  suit: "m" | "p" | "s",
  rank: number,
  suitCounts: Record<"m" | "p" | "s", number[]>,
): boolean {
  const counts = suitCounts[suit];
  return [-2, -1, 1, 2].some((offset) => counts[rank + offset] > 0);
}

function countTileIds(tiles: readonly TileId[]): Map<TileId, number> {
  const counts = new Map<TileId, number>();
  for (const tile of tiles) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  return counts;
}

interface WeakTaatsu {
  kind: "kanchan" | "penchan";
  tiles: [TileId, TileId];
  waits: TileId[];
}

interface CompressedBlock {
  tiles: TileId[];
  waits: TileId[];
  pairTile: TileId;
}

function evaluateBlockEfficiency(
  afterDiscard: readonly TileId[],
  candidate: DiscardCandidate,
  context: NanikiruContext,
): EvaluationPart {
  if (candidate.shanten < 2) {
    return { score: 0, reasons: [] };
  }

  const beforeDiscard = [...afterDiscard, candidate.discard];
  if (countApproximateBlocks(beforeDiscard) < 6) {
    return { score: 0, reasons: [] };
  }

  const compressedBlocks = findCompressedBlocks(beforeDiscard);
  const discardedCompressedBlock = compressedBlocks.find((block) => block.tiles.includes(candidate.discard));
  if (discardedCompressedBlock) {
    const value = getCompressedBlockValue(discardedCompressedBlock, beforeDiscard, context);
    const penalty = Math.round(Math.min(48, 20 + value * 1.5));
    return {
      score: -penalty,
      reasons: [{
        type: "shape",
        polarity: "negative",
        priority: 67,
        message: `六搭子时切 ${candidate.discard} 会拆掉压缩复合块，牌位效率下降。`,
        data: {
          discard: candidate.discard,
          blockEfficiency: -penalty,
          compressedBlock: discardedCompressedBlock.tiles,
          compressedWaits: discardedCompressedBlock.waits,
          compressedBlockValue: value,
        },
      }],
    };
  }

  const weakTaatsu = findWeakTaatsuBrokenByDiscard(beforeDiscard, candidate.discard);
  if (!weakTaatsu || compressedBlocks.length === 0) {
    return { score: 0, reasons: [] };
  }

  const weakValue = getWeakTaatsuValue(weakTaatsu, beforeDiscard, context);
  const bestCompressed = compressedBlocks
    .map((block) => ({ block, value: getCompressedBlockValue(block, beforeDiscard, context) }))
    .sort((a, b) => b.value - a.value)[0];
  if (!bestCompressed || bestCompressed.value < weakValue) {
    return { score: 0, reasons: [] };
  }

  const bonus = Math.round(Math.min(44, 16 + (bestCompressed.value - weakValue) * 1.7 + Math.max(0, 4 - weakValue) * 3));
  return {
    score: bonus,
    reasons: [{
      type: "shape",
      polarity: "positive",
      priority: 73,
      message: `六搭子时切 ${candidate.discard} 拆掉实际进张不占优的${formatWeakTaatsuKind(weakTaatsu.kind)}，保留更压缩的复合块。`,
      data: {
        discard: candidate.discard,
        blockEfficiency: bonus,
        weakTaatsu: weakTaatsu.tiles,
        weakTaatsuWaits: weakTaatsu.waits,
        weakTaatsuValue: weakValue,
        compressedBlock: bestCompressed.block.tiles,
        compressedWaits: bestCompressed.block.waits,
        compressedBlockValue: bestCompressed.value,
      },
    }],
  };
}

function countApproximateBlocks(tiles: readonly TileId[]): number {
  const counts = getSuitCounts(tiles);
  const tileCounts = countTileIds(tiles);
  let blocks = [...tileCounts.values()].filter((count) => count >= 2).length;

  for (const suit of ["m", "p", "s"] as const) {
    const suitCounts = counts[suit];
    for (let rank = 1; rank <= 8; rank += 1) {
      if (suitCounts[rank] > 0 && suitCounts[rank + 1] > 0) {
        blocks += 1;
      }
    }
    for (let rank = 1; rank <= 7; rank += 1) {
      if (suitCounts[rank] > 0 && suitCounts[rank + 2] > 0) {
        blocks += 1;
      }
    }
  }

  return blocks;
}

function findWeakTaatsuBrokenByDiscard(tiles: readonly TileId[], discard: TileId): WeakTaatsu | undefined {
  if (discard[1] === "z") {
    return undefined;
  }
  const suit = discard[1] as "m" | "p" | "s";
  const rank = Number(discard[0]);
  const counts = getSuitCounts(tiles)[suit];
  if (counts[rank] !== 1) {
    return undefined;
  }

  const gapPartners = [rank - 2, rank + 2].filter((item) => item >= 1 && item <= 9);
  for (const partner of gapPartners) {
    if (
      counts[partner] === 1
      && counts[(rank + partner) / 2] === 0
      && !hasAdjacentSupport(counts, rank, partner)
    ) {
      return {
        kind: "kanchan",
        tiles: [discard, toTile(partner, suit)],
        waits: [toTile((rank + partner) / 2, suit)],
      };
    }
  }

  const edgePartner = rank === 1 ? 2 : rank === 2 ? 1 : rank === 8 ? 9 : rank === 9 ? 8 : undefined;
  if (
    edgePartner
    && counts[edgePartner] === 1
    && !hasAdjacentSupport(counts, rank, edgePartner)
  ) {
    return {
      kind: "penchan",
      tiles: [discard, toTile(edgePartner, suit)],
      waits: [toTile(rank <= 2 ? 3 : 7, suit)],
    };
  }

  return undefined;
}

function hasAdjacentSupport(counts: readonly number[], a: number, b: number): boolean {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return [low - 1, high + 1].some((rank) => rank >= 1 && rank <= 9 && counts[rank] > 0);
}

function findCompressedBlocks(tiles: readonly TileId[]): CompressedBlock[] {
  const result: CompressedBlock[] = [];
  const suitCounts = getSuitCounts(tiles);

  for (const suit of ["m", "p", "s"] as const) {
    const counts = suitCounts[suit];
    for (let pairRank = 1; pairRank <= 9; pairRank += 1) {
      if (counts[pairRank] < 2) {
        continue;
      }
      for (const neighborRank of [pairRank - 1, pairRank + 1]) {
        if (neighborRank < 1 || neighborRank > 9 || counts[neighborRank] === 0) {
          continue;
        }
        const waits = getCompressedWaits(pairRank, neighborRank, suit);
        result.push({
          tiles: [toTile(pairRank, suit), toTile(pairRank, suit), toTile(neighborRank, suit)],
          waits,
          pairTile: toTile(pairRank, suit),
        });
      }
    }
  }

  return result;
}

function getCompressedWaits(pairRank: number, neighborRank: number, suit: "m" | "p" | "s"): TileId[] {
  const waits = new Set<TileId>([toTile(pairRank, suit), toTile(neighborRank, suit)]);
  const outside = neighborRank < pairRank ? neighborRank - 1 : neighborRank + 1;
  if (outside >= 1 && outside <= 9) {
    waits.add(toTile(outside, suit));
  }
  return [...waits];
}

function getWeakTaatsuValue(
  taatsu: WeakTaatsu,
  tiles: readonly TileId[],
  context: NanikiruContext,
): number {
  const base = sumRemaining(taatsu.waits, tiles, context) * (taatsu.kind === "kanchan" ? 0.85 : 0.75);
  const doraPenalty = taatsu.tiles.some((tile) => isAkaOrDoraRelevant(tile, context)) ? 6 : 0;
  return base + doraPenalty;
}

function getCompressedBlockValue(
  block: CompressedBlock,
  tiles: readonly TileId[],
  context: NanikiruContext,
): number {
  const remainingValue = sumRemaining(block.waits, tiles, context);
  const pairValue = getPairRouteValue(block.pairTile, context);
  const doraValue = block.tiles.some((tile) => isAkaOrDoraRelevant(tile, context)) ? 4 : 0;
  return remainingValue + pairValue + doraValue;
}

function getPairRouteValue(pairTile: TileId, context: NanikiruContext): number {
  if (pairTile === "5z" || pairTile === "6z" || pairTile === "7z" || pairTile === context.bakaze || pairTile === context.seatWind) {
    return 5;
  }
  return 3;
}

function sumRemaining(tiles: readonly TileId[], handTiles: readonly TileId[], context: NanikiruContext): number {
  return tiles.reduce((total, tile) => total + getRemaining(tile, handTiles, context), 0);
}

function getRemaining(tile: TileId, handTiles: readonly TileId[], context: NanikiruContext): number {
  const visible = context.visibleTiles?.[TILE_INDEX[tile]];
  if (visible !== undefined) {
    return Math.max(0, 4 - visible);
  }
  const handCount = handTiles.filter((item) => item === tile).length;
  const doraIndicatorCount = (context.doraIndicators ?? []).filter((item) => item === tile).length;
  return Math.max(0, 4 - handCount - doraIndicatorCount);
}

function isAkaOrDoraRelevant(tile: TileId, context: NanikiruContext): boolean {
  return ((context.akaDoraCount ?? 0) > 0 && tile[1] !== "z" && tile[0] === "5")
    || (context.doraIndicators ?? []).some((indicator) => nextDoraTile(indicator) === tile);
}

function formatWeakTaatsuKind(kind: WeakTaatsu["kind"]): string {
  return kind === "kanchan" ? "孤立嵌张搭子" : "孤立边张搭子";
}

function toTile(rank: number, suit: "m" | "p" | "s"): TileId {
  return `${rank}${suit}` as TileId;
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
  return `${rank === 9 ? 1 : rank + 1}${suit}` as TileId;
}

import type { TileId } from "../../core/tile.ts";
import type { DiscardCandidate } from "../../service/analyze.ts";
import type { EvaluationPart } from "./evaluation.ts";

export function evaluateShape(
  afterDiscard: readonly TileId[],
  candidate: DiscardCandidate,
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

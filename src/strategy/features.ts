import type { TileId } from "../core/tile.ts";
import type { TileInfo } from "../hand/paili.ts";
import type { DiscardCandidate } from "../service/analyze.ts";
import type { NanikiruContext } from "./nanikiru-context.ts";
import { extractShapeFeatures, type ShapeFeatures } from "./evaluators/evaluate-shape.ts";

export interface CandidateFeature {
  discard: TileId;
  beforeDiscard: readonly TileId[];
  afterDiscard: readonly TileId[];
  shanten: number;
  waits: readonly TileInfo[];
  totalWaits: number;
  goodShapeCount: number;
  goodShapeRatio: number;
  goodShapeDraws: readonly TileId[];
  counts: Map<TileId, number>;
  shape: ShapeFeatures;
  blocks: {
    pairCount: number;
    tripletCount: number;
    ryanmenCount: number;
    kanchanCount: number;
    penchanCount: number;
    complexShapeCount: number;
  };
  tiles: {
    terminalHonorCount: number;
    simpleCount: number;
    doraTiles: TileId[];
    doraCount: number;
    akaDoraCount: number;
    doraSideCount: number;
    yakuhaiPairs: TileId[];
  };
}

export function buildCandidateFeature(
  beforeDiscard: readonly TileId[],
  afterDiscard: readonly TileId[],
  candidate: Pick<DiscardCandidate, "discard" | "shanten" | "waits" | "totalWaits" | "goodShapeCount" | "goodShapeDraws">,
  context: NanikiruContext = {},
): CandidateFeature {
  const counts = countTileIds(afterDiscard);
  const shape = extractShapeFeatures(afterDiscard, candidate.discard);
  const doraTiles = (context.doraIndicators ?? []).map(nextDoraTile);
  const doraCount = afterDiscard.filter((tile) => doraTiles.includes(tile)).length;
  const akaDoraCount = Math.max(
    0,
    (context.akaDoraCount ?? 0) - (isNumberFive(candidate.discard) ? 1 : 0),
  );

  return {
    discard: candidate.discard,
    beforeDiscard,
    afterDiscard,
    shanten: candidate.shanten,
    waits: candidate.waits,
    totalWaits: candidate.totalWaits,
    goodShapeCount: candidate.goodShapeCount,
    goodShapeRatio: candidate.totalWaits > 0 ? candidate.goodShapeCount / candidate.totalWaits : 0,
    goodShapeDraws: candidate.goodShapeDraws,
    counts,
    shape,
    blocks: {
      pairCount: countPairsFromCounts(counts),
      tripletCount: [...counts.values()].filter((count) => count >= 3).length,
      ryanmenCount: shape.ryanmen,
      kanchanCount: shape.kanchan,
      penchanCount: shape.penchan,
      complexShapeCount: shape.complex,
    },
    tiles: {
      terminalHonorCount: afterDiscard.filter(isTerminalOrHonor).length,
      simpleCount: afterDiscard.filter(isSimpleTile).length,
      doraTiles,
      doraCount,
      akaDoraCount,
      doraSideCount: afterDiscard.filter((tile) => isDoraSide(tile, doraTiles)).length,
      yakuhaiPairs: getYakuhaiPairsFromCounts(counts, context),
    },
  };
}

export function countTileIds(tiles: readonly TileId[]): Map<TileId, number> {
  const counts = new Map<TileId, number>();
  for (const tile of tiles) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  return counts;
}

export function countPairsFromCounts(counts: ReadonlyMap<TileId, number>): number {
  return [...counts.values()].filter((count) => count >= 2).length;
}

export function getYakuhaiPairsFromCounts(
  counts: ReadonlyMap<TileId, number>,
  context: NanikiruContext,
): TileId[] {
  const yakuhaiTiles = new Set<TileId>(["5z", "6z", "7z"]);
  if (context.bakaze) {
    yakuhaiTiles.add(context.bakaze);
  }
  if (context.seatWind) {
    yakuhaiTiles.add(context.seatWind);
  }
  return [...yakuhaiTiles].filter((tile) => (counts.get(tile) ?? 0) >= 2);
}

export function nextDoraTile(indicator: TileId): TileId {
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

export function isDoraSide(tile: TileId, doraTiles: readonly TileId[]): boolean {
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

export function isTerminalOrHonor(tile: TileId): boolean {
  return tile[1] === "z" || tile[0] === "1" || tile[0] === "9";
}

export function isSimpleTile(tile: TileId): boolean {
  const rank = Number(tile[0]);
  return tile[1] !== "z" && rank >= 2 && rank <= 8;
}

export function isNumberFive(tile: TileId): boolean {
  return tile[1] !== "z" && tile[0] === "5";
}

import { TILE_INDEX, TILES_34, type TileId } from "./tile.ts";

export type Counts34 = number[];

export function createEmptyCounts34(): Counts34 {
  return Array(34).fill(0) as Counts34;
}

export function tilesToCounts34(tiles: readonly TileId[]): Counts34 {
  const counts = createEmptyCounts34();
  for (const tile of tiles) {
    counts[TILE_INDEX[tile]] += 1;
  }
  return counts;
}

export function countsToTiles(counts: readonly number[]): TileId[] {
  const tiles: TileId[] = [];
  for (let i = 0; i < TILES_34.length; i += 1) {
    for (let n = 0; n < counts[i]; n += 1) {
      tiles.push(TILES_34[i]);
    }
  }
  return tiles;
}

export function assertCounts34(counts: readonly number[]): void {
  if (counts.length !== 34) {
    throw new Error(`Counts34 must contain 34 entries, got ${counts.length}`);
  }

  for (const count of counts) {
    if (!Number.isInteger(count) || count < 0 || count > 4) {
      throw new Error(`Counts34 entries must be integers between 0 and 4, got ${count}`);
    }
  }
}

export function countTiles(counts: readonly number[]): number {
  let total = 0;
  for (const count of counts) {
    total += count;
  }
  return total;
}

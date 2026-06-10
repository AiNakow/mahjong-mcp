export const TILES_34 = [
  "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m",
  "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p",
  "1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s",
  "1z", "2z", "3z", "4z", "5z", "6z", "7z",
] as const;

export type TileId = (typeof TILES_34)[number];
export type Suit = "m" | "p" | "s" | "z";
export type WindTile = "1z" | "2z" | "3z" | "4z";

export interface Tile {
  id: TileId;
  suit: Suit;
  rank: number;
  red: boolean;
}

export class TileParseError extends Error {
  constructor(input: string) {
    super(`Invalid tile input: ${input}`);
    this.name = "TileParseError";
  }
}

export const TILE_INDEX: Record<TileId, number> = TILES_34.reduce(
  (acc, tile, index) => {
    acc[tile] = index;
    return acc;
  },
  {} as Record<TileId, number>,
);

const TILE_SET = new Set<string>(TILES_34);

export function isTileId(value: string): value is TileId {
  return TILE_SET.has(value);
}

export function parseTileId(value: string): TileId {
  if (!isTileId(value)) {
    throw new TileParseError(value);
  }
  return value;
}

export function tileIndex(tile: TileId): number {
  return TILE_INDEX[tile];
}

export function tileFromId(id: TileId): Tile {
  return {
    id,
    suit: id[1] as Suit,
    rank: Number(id[0]),
    red: false,
  };
}

export function parseTileGroups(input: string): TileId[] {
  const groups = input.match(/\d+[mpsz]/g) ?? [];
  const tiles: TileId[] = [];

  for (const group of groups) {
    const suit = group[group.length - 1];
    for (const rank of group.slice(0, -1)) {
      const tile = `${rank}${suit}`;
      if (!isTileId(tile)) {
        throw new TileParseError(tile);
      }
      tiles.push(tile);
    }
  }

  return tiles;
}

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
const RED_FIVE_MAP = {
  "0m": "5m",
  "0p": "5p",
  "0s": "5s",
} as const;

export function isTileId(value: string): value is TileId {
  return TILE_SET.has(value);
}

export function parseTileId(value: string): TileId {
  const normalized = normalizeTileId(value);
  if (!isTileId(normalized)) {
    throw new TileParseError(value);
  }
  return normalized;
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
  return parseTileGroupsWithRed(input).tiles;
}

export interface ParsedTileGroups {
  tiles: TileId[];
  akaDoraCount: number;
}

export function parseTileGroupsWithRed(input: string): ParsedTileGroups {
  const groups = input.match(/\d+[mpsz]/g) ?? [];
  const tiles: TileId[] = [];
  let akaDoraCount = 0;

  for (const group of groups) {
    const suit = group[group.length - 1];
    for (const rank of group.slice(0, -1)) {
      const rawTile = `${rank}${suit}`;
      const tile = normalizeTileId(rawTile);
      if (!isTileId(tile)) {
        throw new TileParseError(rawTile);
      }
      if (rawTile in RED_FIVE_MAP) {
        akaDoraCount += 1;
      }
      tiles.push(tile);
    }
  }

  return { tiles, akaDoraCount };
}

export function normalizeTileId(value: string): string {
  if (value in RED_FIVE_MAP) {
    return RED_FIVE_MAP[value as keyof typeof RED_FIVE_MAP];
  }
  return value;
}

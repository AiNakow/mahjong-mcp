import type { TileId } from "./tile.ts";

export type Action =
  | { type: "discard"; tile: TileId }
  | { type: "riichi"; tile: TileId }
  | { type: "tsumo" }
  | { type: "ron" }
  | { type: "chi"; tiles: TileId[] }
  | { type: "pon"; tiles: TileId[] }
  | { type: "kan"; tiles: TileId[] }
  | { type: "pass" };

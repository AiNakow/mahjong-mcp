import type { GameState } from "../core/state.ts";
import { TILE_INDEX, type TileId } from "../core/tile.ts";

export function getVisibleCount(state: GameState, tile: TileId): number {
  return state.visibleTiles[TILE_INDEX[tile]] ?? 0;
}

export function getRemainingCount(state: GameState, tile: TileId): number {
  return Math.max(0, 4 - getVisibleCount(state, tile));
}

export function estimateUnknownWallSize(state: GameState): number {
  const visible = state.visibleTiles.reduce((total, count) => total + count, 0);
  return Math.max(1, 136 - 14 - visible);
}

export function estimateRemainingOwnDraws(state: GameState): number {
  return Math.max(0, Math.ceil((18 - state.round.turn) * 0.75));
}

export function clampProbability(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
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

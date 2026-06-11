import type { GameState } from "../core/state.ts";
import { TILES_34, type TileId } from "../core/tile.ts";

interface HighValueState extends GameState {
  averageWaitPoints?: number;
}

export function isHighValueHand(state: GameState): boolean {
  const doraTiles = state.doraIndicators.map(nextDoraTile);
  const selfTiles = [
    ...(state.self.hand ?? []),
    ...(state.lastDraw ? [state.lastDraw] : []),
  ];
  const doraCount = selfTiles.filter((tile) => doraTiles.includes(tile)).length;
  const averageWaitPoints = (state as HighValueState).averageWaitPoints ?? 0;

  return doraCount >= 2 || averageWaitPoints >= 7700;
}

export function nextDoraTile(indicator: TileId): TileId {
  const suit = indicator[1];
  const rank = Number(indicator[0]);
  if (suit === "z") {
    if (rank >= 1 && rank <= 4) {
      return TILES_34[27 + (rank % 4)];
    }
    return ({ 5: "6z", 6: "7z", 7: "5z" } as Record<number, TileId>)[rank];
  }
  const nextRank = rank === 9 ? 1 : rank + 1;
  return `${nextRank}${suit}` as TileId;
}

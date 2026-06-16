import { tileFromId, type TileId } from "../core/tile.ts";
import type { DecisionAction } from "./action-types.ts";

export function getPostCallForbiddenDiscards(
  action: Extract<DecisionAction, { type: "chi" | "pon" }>,
): TileId[] {
  if (action.type === "pon") {
    return [action.calledTile];
  }
  const consumed = removeOne(action.tiles, action.calledTile);
  const forbidden = new Set<TileId>([action.calledTile]);
  for (const tile of getSequenceReplacementTiles(consumed)) {
    forbidden.add(tile);
  }
  return [...forbidden];
}

function getSequenceReplacementTiles(consumed: readonly TileId[]): TileId[] {
  if (consumed.length !== 2) {
    return [];
  }
  const [first, second] = consumed.map(tileFromId);
  if (first.suit !== second.suit || first.suit === "z") {
    return [];
  }
  const suit = first.suit;
  const ranks = new Set([first.rank, second.rank]);
  const replacements: TileId[] = [];
  for (let rank = 1; rank <= 9; rank += 1) {
    const candidateRanks = [...ranks, rank].sort((a, b) => a - b);
    if (
      candidateRanks.length === 3
      && candidateRanks[0] + 1 === candidateRanks[1]
      && candidateRanks[1] + 1 === candidateRanks[2]
    ) {
      replacements.push(`${rank}${suit}` as TileId);
    }
  }
  return replacements;
}

function removeOne(tiles: readonly TileId[], tile: TileId): TileId[] {
  const rest = [...tiles];
  const index = rest.indexOf(tile);
  if (index >= 0) {
    rest.splice(index, 1);
  }
  return rest;
}

import type { RuleConfig } from "../core/rules.ts";
import type { Call } from "../core/state.ts";
import type { TileId, WindTile } from "../core/tile.ts";

export interface NanikiruContext {
  calls?: Call[];
  seatWind?: WindTile;
  bakaze?: WindTile;
  rules?: RuleConfig;
  honba?: number;
  riichiSticks?: number;
  doraIndicators?: TileId[];
  uraDoraIndicators?: TileId[];
  akaDoraCount?: number;
}

export function isOpenHand(context: NanikiruContext = {}): boolean {
  return (context.calls ?? []).some((call) => call.type !== "ankan");
}

export function getContextVisibleTiles(context: NanikiruContext = {}): TileId[] {
  return [
    ...(context.calls ?? []).flatMap((call) => call.tiles),
    ...(context.doraIndicators ?? []),
  ];
}

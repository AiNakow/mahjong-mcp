import type { RuleConfig } from "../core/rules.ts";
import type { Counts34 } from "../core/counts.ts";
import type { Call, Discard } from "../core/state.ts";
import type { TileId, WindTile } from "../core/tile.ts";

export interface OpponentContext {
  seatWind?: WindTile;
  points?: number;
  calls?: Call[];
  discards?: Discard[];
  riichi?: boolean;
  ippatsu?: boolean;
  menzen?: boolean;
}

export interface NanikiruContext {
  calls?: Call[];
  seatWind?: WindTile;
  bakaze?: WindTile;
  kyoku?: number;
  turn?: number;
  points?: number;
  opponents?: OpponentContext[];
  visibleTiles?: Counts34;
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

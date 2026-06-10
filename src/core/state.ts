import type { Counts34 } from "./counts.ts";
import type { RuleConfig } from "./rules.ts";
import type { TileId, WindTile } from "./tile.ts";

export interface RoundState {
  bakaze: WindTile;
  kyoku: number;
  honba: number;
  riichiSticks: number;
  turn: number;
}

export interface PlayerState {
  seatWind: WindTile;
  points: number;
  hand?: TileId[];
  calls: Call[];
  discards: Discard[];
  riichi: boolean;
  ippatsu: boolean;
  menzen: boolean;
}

export interface Call {
  type: "chi" | "pon" | "kan" | "ankan" | "kakan";
  tiles: TileId[];
}

export interface Discard {
  tile: TileId;
  tsumogiri: boolean;
}

export interface DiscardEvent extends Discard {
  playerIndex: number;
}

export interface GameState {
  round: RoundState;
  self: PlayerState;
  opponents: PlayerState[];
  doraIndicators: TileId[];
  visibleTiles: Counts34;
  lastDraw?: TileId;
  lastDiscard?: DiscardEvent;
  rules: RuleConfig;
}

export interface MinimalHandState {
  self: {
    hand: TileId[];
    drawnTile?: TileId;
  };
  visibleTiles: Counts34;
  doraIndicators: TileId[];
  rules: RuleConfig;
}

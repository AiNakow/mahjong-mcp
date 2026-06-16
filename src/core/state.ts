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

export type CallType = "chi" | "pon" | "minkan" | "ankan" | "kakan";
export type CallFrom = "left" | "across" | "right" | "self";

export interface Call {
  type: CallType;
  tiles: TileId[];
  calledTile?: TileId;
  from?: CallFrom;
}

export interface Discard {
  tile: TileId;
  tsumogiri: boolean;
}

export interface DiscardEvent extends Discard {
  playerIndex: number;
}

export interface KanEvent {
  type: "minkan" | "ankan" | "kakan";
  tile: TileId;
  playerIndex: number;
}

export interface GameState {
  phase?: "self_draw" | "opponent_discard" | "chankan" | "rinshan_draw" | "after_call_discard";
  forbiddenDiscards?: TileId[];
  temporaryFuriten?: boolean;
  riichiFuriten?: boolean;
  round: RoundState;
  self: PlayerState;
  opponents: PlayerState[];
  doraIndicators: TileId[];
  visibleTiles: Counts34;
  lastDraw?: TileId;
  lastDiscard?: DiscardEvent;
  lastKan?: KanEvent;
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

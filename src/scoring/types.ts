import type { Call } from "../core/state.ts";
import type { RuleConfig } from "../core/rules.ts";
import type { TileId, WindTile } from "../core/tile.ts";

export type AgariMethod = "ron" | "tsumo";
export type AgariKind = "standard" | "chiitoi" | "kokushi";
export type MeldKind = "sequence" | "triplet" | "quad";
export type MeldSource = "concealed" | "open" | "ankan";
export type WaitKind = "ryanmen" | "kanchan" | "penchan" | "tanki" | "shanpon" | "kokushi_13";
export type ScoreWarningSeverity = "warning" | "error";
export type ScoreWarningCode =
  | "riichi_open_hand"
  | "ippatsu_without_riichi"
  | "double_riichi_with_riichi"
  | "tenhou_not_dealer_tsumo"
  | "chiihou_dealer"
  | "chiihou_not_tsumo"
  | "haitei_houtei_conflict"
  | "rinshan_chankan_conflict"
  | "aka_dora_disabled"
  | "ura_dora_without_riichi";

export interface AgariContext {
  hand: TileId[];
  winningTile: TileId;
  method: AgariMethod;
  calls?: Call[];
  bakaze?: WindTile;
  seatWind?: WindTile;
  honba?: number;
  riichiSticks?: number;
  rules?: RuleConfig;
  riichi?: boolean;
  doubleRiichi?: boolean;
  ippatsu?: boolean;
  rinshan?: boolean;
  chankan?: boolean;
  haitei?: boolean;
  houtei?: boolean;
  tenhou?: boolean;
  chiihou?: boolean;
  doraIndicators?: TileId[];
  uraDoraIndicators?: TileId[];
  akaDoraCount?: number;
}

export interface ScoreWarning {
  code: ScoreWarningCode;
  message: string;
  severity: ScoreWarningSeverity;
}

export interface MeldShape {
  kind: MeldKind;
  tiles: TileId[];
  source: MeldSource;
}

export interface AgariDecomposition {
  kind: AgariKind;
  pair?: TileId;
  melds: MeldShape[];
  winningTile: TileId;
  winningMeldIndex?: number;
  wait?: WaitKind;
}

export interface YakuResult {
  id: string;
  name: string;
  han: number;
  yakuman?: number;
}

export interface PointResult {
  basePoints: number;
  limit?: "mangan" | "haneman" | "baiman" | "sanbaiman" | "yakuman";
  total: number;
  ron?: number;
  tsumo?: {
    dealer: number;
    nonDealer: number;
  };
}

export interface ScoreCandidate {
  decomposition: AgariDecomposition;
  yaku: YakuResult[];
  han: number;
  fu: number;
  points: PointResult;
}

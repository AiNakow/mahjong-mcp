import type { GameState } from "../core/state.ts";
import type { RuleConfig } from "../core/rules.ts";
import type { TileId, WindTile } from "../core/tile.ts";
import type { ShantenMode } from "../hand/paili.ts";
import type { CandidateAction, EstimateMode } from "../ev/index.ts";
import type { NanikiruContext } from "../strategy/nanikiru-context.ts";
import type { NanikiruPolicy } from "../strategy/nanikiru-policy.ts";
import type { Call } from "../core/state.ts";
import type { AgariMethod } from "../scoring/index.ts";
import type { ServiceSource } from "./responses.ts";

export interface AdapterRequestOptions {
  source?: ServiceSource;
  requestId?: string;
}

export interface AnalyzeHandRequest {
  text: string;
  mode?: ShantenMode;
  unavailableTiles?: TileId[];
  verbose?: boolean;
}

export interface NanikiruRequest {
  text: string;
  mode?: ShantenMode;
  context?: {
    calls?: Call[];
    seatWind?: WindTile;
    bakaze?: WindTile;
    kyoku?: number;
    points?: number;
    opponents?: NanikiruContext["opponents"];
    honba?: number;
    turn?: number;
    riichiSticks?: number;
    doraIndicators?: TileId[];
    uraDoraIndicators?: TileId[];
    akaDoraCount?: number;
    rules?: RuleConfig;
  };
  policy?: Partial<NanikiruPolicy>;
  options?: {
    includeCandidates?: boolean;
    includeRaw?: boolean;
    verbose?: boolean;
    useEvDecision?: boolean;
  };
}

export interface ScoreHandRequest {
  text: string;
  winningTile: TileId;
  method: AgariMethod;
  calls?: Call[];
  seatWind?: WindTile;
  bakaze?: WindTile;
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
  honba?: number;
  riichiSticks?: number;
  doraIndicators?: TileId[];
  uraDoraIndicators?: TileId[];
  akaDoraCount?: number;
  options?: {
    verbose?: boolean;
    includeCandidates?: boolean;
    includeDecompositions?: boolean;
    includeRaw?: boolean;
  };
}

export interface ChooseActionRequest {
  state: GameState;
  policy?: Partial<NanikiruPolicy>;
  options?: {
    useEvDecision?: boolean;
    includeCandidates?: boolean;
    includeAnalysis?: boolean;
    includeEstimate?: boolean;
  };
}

export interface EstimateRequest {
  state: GameState;
  action?: CandidateAction;
  mode?: EstimateMode;
  options?: {
    includeCandidates?: boolean;
  };
}

export interface ParseScreenshotRequest {
  imageBase64?: string;
  imageUrl?: string;
  layoutHint?: "majsoul" | "tenhou" | "mortal" | "unknown";
}


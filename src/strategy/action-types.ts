import type { TileId } from "../core/tile.ts";
import type { RoundEstimate } from "../ev/index.ts";
import type { Reason } from "./reason.ts";

export type StrategyMode = "attack" | "balance" | "defense" | "push";

export type DecisionPhase =
  | "self_draw"
  | "opponent_discard"
  | "after_call_discard"
  | "unknown";

export type DecisionAction =
  | { type: "discard"; tile: TileId }
  | { type: "riichi"; tile: TileId }
  | { type: "tsumo" }
  | { type: "ron" }
  | { type: "chi"; tiles: TileId[]; calledTile: TileId; discard: TileId }
  | { type: "pon"; tiles: TileId[]; calledTile: TileId; discard: TileId }
  | { type: "minkan"; tiles: TileId[]; calledTile: TileId; discard?: TileId }
  | { type: "ankan"; tiles: TileId[]; discard?: TileId }
  | { type: "kakan"; tiles: TileId[]; discard?: TileId }
  | { type: "pass" };

export type ActionCategory =
  | "agari"
  | "discard"
  | "riichi"
  | "call"
  | "kan"
  | "pass";

export interface ActionScoreBreakdown {
  agari?: number;
  speed?: number;
  value?: number;
  defense?: number;
  placement?: number;
  ev?: number;
  callCost?: number;
  kanRisk?: number;
}

export interface EvaluatedAction {
  action: DecisionAction;
  phase: DecisionPhase;
  legal: boolean;
  score: number;
  priority: number;
  category: ActionCategory;
  scoreBreakdown: ActionScoreBreakdown;
  estimate?: RoundEstimate;
  reasons: Reason[];
  warnings: Reason[];
  source?: unknown;
}

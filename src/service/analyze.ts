import type { TileId } from "../core/tile.ts";
import {
  analyzeHand,
  MahjongHandError,
  type AnalysisResult,
  type ShantenMode,
  type TileInfo,
} from "../hand/paili.ts";
import { HandTextParseError, parseHandText } from "./parse-hand.ts";

export interface HandAnalysisInput {
  text: string;
  mode?: ShantenMode;
  includeShantenBack?: boolean;
  includeRaw?: boolean;
  verbose?: boolean;
}

export interface DrawAnalysis {
  kind: "draw";
  input: string;
  handText: string;
  hand: TileId[];
  tileCount: number;
  shanten: number;
  isTenpai: boolean;
  isAgari: boolean;
  draws: TileInfo[];
  totalDraws: number;
  goodShapeCount: number;
  goodShapeDraws: TileId[];
  raw?: AnalysisResult;
}

export interface DiscardCandidate {
  discard: TileId;
  shanten: number;
  waits: TileInfo[];
  totalWaits: number;
  goodShapeCount: number;
  goodShapeDraws: TileId[];
}

export interface DiscardAnalysis {
  kind: "discard";
  input: string;
  handText: string;
  hand: TileId[];
  tileCount: number;
  shanten: number;
  isTenpai: boolean;
  isAgari: boolean;
  candidates: DiscardCandidate[];
  recommendation?: TileId;
  raw?: AnalysisResult;
}

export type HandAnalysis = DrawAnalysis | DiscardAnalysis;

export function analyzeHandText(input: string | HandAnalysisInput, mode: ShantenMode = 0): HandAnalysis {
  const request = typeof input === "string" ? { text: input, mode } : input;
  const requestMode = request.mode ?? mode;
  const includeShantenBack = request.includeShantenBack ?? true;
  const handText = parseHandText(request.text);

  let raw: AnalysisResult;
  try {
    raw = analyzeHand(handText, requestMode, { includeShantenBack });
  } catch (error) {
    if (error instanceof MahjongHandError) {
      throw new HandTextParseError(request.text);
    }
    throw error;
  }

  const base: {
    input: string;
    handText: string;
    hand: TileId[];
    tileCount: number;
    shanten: number;
    isTenpai: boolean;
    isAgari: boolean;
    raw?: AnalysisResult;
  } = {
    input: request.text,
    handText,
    hand: raw.hand,
    tileCount: raw.tile_count,
    shanten: raw.shanten,
    isTenpai: raw.is_tenpai,
    isAgari: raw.is_agari,
  };
  if (request.verbose || request.includeRaw) {
    base.raw = raw;
  }

  if (raw.kind === "draw") {
    return {
      kind: "draw",
      ...base,
      draws: raw.draws,
      totalDraws: raw.total_draws,
      goodShapeCount: raw.good_shape_count,
      goodShapeDraws: raw.good_shape_draws,
    };
  }

  const candidates: DiscardCandidate[] = raw.discards.map((discard) => ({
    discard: discard.discard.id,
    shanten: discard.shanten,
    waits: discard.waits,
    totalWaits: discard.total_waits,
    goodShapeCount: discard.good_shape_count,
    goodShapeDraws: discard.good_shape_draws,
  }));

  return {
    kind: "discard",
    ...base,
    candidates,
    recommendation: candidates[0]?.discard,
  };
}

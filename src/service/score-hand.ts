import type { TileId, WindTile } from "../core/tile.ts";
import { parseTileGroupsWithRed, parseTileId } from "../core/tile.ts";
import { DEFAULT_RULE_CONFIG, type RuleConfig } from "../core/rules.ts";
import type { Call } from "../core/state.ts";
import {
  calculateAgariScore,
  type AgariContext,
  type AgariDecomposition,
  type AgariMethod,
  type AgariScoreResult,
  type AgariScoreStatus,
  type ScoreCandidate,
  type ScoreWarning,
} from "../scoring/index.ts";
import { HandTextParseError, parseHandText } from "./parse-hand.ts";

export interface ScoreHandInput {
  text: string;
  winningTile: TileId;
  method: AgariMethod;
  verbose?: boolean;
  includeCandidates?: boolean;
  includeDecompositions?: boolean;
  includeRaw?: boolean;
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
}

export interface ScoreHandResult {
  input: string;
  handText: string;
  hand: TileId[];
  winningTile: TileId;
  method: AgariMethod;
  calls: Call[];
  status: AgariScoreStatus;
  warnings: ScoreWarning[];
  decompositions?: AgariDecomposition[];
  candidates?: ScoreCandidate[];
  best?: ScoreCandidate;
  raw?: AgariScoreResult;
}

export function scoreHand(input: ScoreHandInput): ScoreHandResult {
  const handText = parseHandText(input.text);
  let hand: TileId[];
  let parsedAkaDoraCount = 0;
  try {
    const parsed = parseTileGroupsWithRed(handText);
    hand = parsed.tiles;
    parsedAkaDoraCount = parsed.akaDoraCount;
  } catch {
    throw new HandTextParseError(input.text);
  }

  const context: AgariContext = {
    hand,
    winningTile: input.winningTile,
    method: input.method,
    calls: input.calls,
    seatWind: input.seatWind,
    bakaze: input.bakaze,
    rules: input.rules ?? DEFAULT_RULE_CONFIG,
    riichi: input.riichi,
    doubleRiichi: input.doubleRiichi,
    ippatsu: input.ippatsu,
    rinshan: input.rinshan,
    chankan: input.chankan,
    haitei: input.haitei,
    houtei: input.houtei,
    tenhou: input.tenhou,
    chiihou: input.chiihou,
    honba: input.honba,
    riichiSticks: input.riichiSticks,
    doraIndicators: input.doraIndicators,
    uraDoraIndicators: input.uraDoraIndicators,
    akaDoraCount: parsedAkaDoraCount + (input.akaDoraCount ?? 0),
  };
  const raw = calculateAgariScore(context);

  const result: ScoreHandResult = {
    input: input.text,
    handText,
    hand,
    winningTile: input.winningTile,
    method: input.method,
    calls: input.calls ?? [],
    status: raw.status,
    warnings: raw.warnings,
    best: raw.best,
  };
  if (input.verbose || input.includeDecompositions) {
    result.decompositions = raw.decompositions;
  }
  if (input.verbose || input.includeCandidates) {
    result.candidates = raw.candidates;
  }
  if (input.verbose || input.includeRaw) {
    result.raw = raw;
  }
  return result;
}

export function parseScoreHandTile(value: string): TileId {
  return parseTileId(value);
}

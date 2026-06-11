import { readFileSync } from "node:fs";

import { DEFAULT_RULE_CONFIG, type RuleConfig } from "../core/rules.ts";
import type { Call, Discard, GameState, PlayerState } from "../core/state.ts";
import { parseTileGroupsWithRed, parseTileId, type TileId, type WindTile } from "../core/tile.ts";
import { buildVisibleTilesFromState, chooseAction } from "../strategy/choose-action.ts";
import {
  nextValue,
  parseCallWithRed,
  parseNonNegativeInteger,
  parseTileList,
  parseWind,
} from "./cli-common.ts";

declare const process: {
  argv: string[];
  exitCode?: number;
};

type RelativeOpponent = "left" | "across" | "right";

interface OpponentCliOptions {
  riichi?: boolean;
  points?: number;
  seatWind?: WindTile;
  discards?: Discard[];
  calls?: Call[];
}

interface CliOptions {
  text?: string;
  statePath?: string;
  verbose?: boolean;
  draw?: TileId;
  calls?: Call[];
  seatWind?: WindTile;
  points?: number;
  bakaze?: WindTile;
  kyoku?: number;
  turn?: number;
  honba?: number;
  riichiSticks?: number;
  doraIndicators?: TileId[];
  rules?: RuleConfig;
  akaDoraCount?: number;
  opponents: Record<RelativeOpponent, OpponentCliOptions>;
}

interface CliResult {
  mode: string;
  action?: {
    type: "discard";
    tile: TileId;
  };
  explanation: string;
  recommendedCandidate?: unknown;
  analysis?: unknown;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const state = options.statePath ? loadState(options.statePath) : buildStateFromOptions(options);
  const decision = chooseAction(state);
  console.log(JSON.stringify(toCliResult(decision, options.verbose)));
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    opponents: {
      left: {},
      across: {},
      right: {},
    },
  };

  let positionalTextSet = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--") && !positionalTextSet) {
      options.text = arg;
      positionalTextSet = true;
    } else if (arg === "--state") {
      options.statePath = nextValue(args, ++i, arg);
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "--draw") {
      options.draw = parseTileId(nextValue(args, ++i, arg));
    } else if (arg === "--call") {
      const parsed = parseCallWithRed(nextValue(args, ++i, arg));
      options.calls = [...(options.calls ?? []), parsed.call];
      options.akaDoraCount = (options.akaDoraCount ?? 0) + parsed.akaDoraCount;
    } else if (arg === "--seat") {
      options.seatWind = parseWind(nextValue(args, ++i, arg));
    } else if (arg === "--points") {
      options.points = parseNonNegativeInteger(nextValue(args, ++i, arg), arg);
    } else if (arg === "--round") {
      options.bakaze = parseWind(nextValue(args, ++i, arg));
    } else if (arg === "--kyoku") {
      options.kyoku = parseNonNegativeInteger(nextValue(args, ++i, arg), arg);
    } else if (arg === "--turn") {
      options.turn = parseNonNegativeInteger(nextValue(args, ++i, arg), arg);
    } else if (arg === "--honba") {
      options.honba = parseNonNegativeInteger(nextValue(args, ++i, arg), arg);
    } else if (arg === "--riichi-sticks") {
      options.riichiSticks = parseNonNegativeInteger(nextValue(args, ++i, arg), arg);
    } else if (arg === "--dora") {
      options.doraIndicators = parseTileList(nextValue(args, ++i, arg));
    } else if (arg === "--no-kuitan") {
      options.rules = {
        ...(options.rules ?? DEFAULT_RULE_CONFIG),
        kuitan: false,
      };
    } else if (arg === "--double-yakuman") {
      options.rules = {
        ...(options.rules ?? DEFAULT_RULE_CONFIG),
        countDoubleYakuman: true,
      };
    } else if (isOpponentFlag(arg, "riichi")) {
      options.opponents[getOpponentFromFlag(arg)].riichi = true;
    } else if (isOpponentFlag(arg, "discards")) {
      options.opponents[getOpponentFromFlag(arg)].discards = parseDiscards(nextValue(args, ++i, arg));
    } else if (isOpponentFlag(arg, "call")) {
      const opponent = options.opponents[getOpponentFromFlag(arg)];
      const parsed = parseCallWithRed(nextValue(args, ++i, arg));
      opponent.calls = [...(opponent.calls ?? []), parsed.call];
    } else if (isOpponentFlag(arg, "points")) {
      options.opponents[getOpponentFromFlag(arg)].points = parseNonNegativeInteger(nextValue(args, ++i, arg), arg);
    } else if (isOpponentFlag(arg, "seat")) {
      options.opponents[getOpponentFromFlag(arg)].seatWind = parseWind(nextValue(args, ++i, arg));
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  return options;
}

function loadState(path: string): GameState {
  return JSON.parse(readFileSync(path, "utf8")) as GameState;
}

function buildStateFromOptions(options: CliOptions): GameState {
  const parsedHand = parseTileGroupsWithRed(options.text ?? "345m35p13789s1234z");
  const selfSeat = options.seatWind ?? "1z";
  const self: PlayerState = {
    seatWind: selfSeat,
    points: options.points ?? 25000,
    hand: parsedHand.tiles,
    calls: options.calls ?? [],
    discards: [],
    riichi: false,
    ippatsu: false,
    menzen: (options.calls ?? []).every((call) => call.type === "ankan"),
  };
  const stateWithoutVisible: Omit<GameState, "visibleTiles"> = {
    round: {
      bakaze: options.bakaze ?? "1z",
      kyoku: options.kyoku ?? 1,
      honba: options.honba ?? 0,
      riichiSticks: options.riichiSticks ?? 0,
      turn: options.turn ?? 8,
    },
    self,
    opponents: (["left", "across", "right"] as const).map((relative) => buildOpponent(relative, selfSeat, options.opponents[relative])),
    doraIndicators: options.doraIndicators ?? [],
    lastDraw: options.draw,
    rules: options.rules ?? DEFAULT_RULE_CONFIG,
  };

  return {
    ...stateWithoutVisible,
    visibleTiles: buildVisibleTilesFromState(stateWithoutVisible),
  };
}

function buildOpponent(
  relative: RelativeOpponent,
  selfSeat: WindTile,
  options: OpponentCliOptions,
): PlayerState {
  const calls = options.calls ?? [];
  return {
    seatWind: options.seatWind ?? inferRelativeSeatWind(selfSeat, relative),
    points: options.points ?? 25000,
    calls,
    discards: options.discards ?? [],
    riichi: options.riichi ?? false,
    ippatsu: false,
    menzen: calls.every((call) => call.type === "ankan"),
  };
}

function parseDiscards(value: string): Discard[] {
  return parseTileList(value).map((tile) => ({ tile, tsumogiri: false }));
}

function inferRelativeSeatWind(selfSeat: WindTile, relative: RelativeOpponent): WindTile {
  const winds: WindTile[] = ["1z", "2z", "3z", "4z"];
  const selfIndex = winds.indexOf(selfSeat);
  const offset = relative === "right" ? 1 : relative === "across" ? 2 : 3;
  return winds[(selfIndex + offset) % winds.length];
}

function isOpponentFlag(arg: string, name: string): boolean {
  return arg === `--left-${name}` || arg === `--across-${name}` || arg === `--right-${name}`;
}

function getOpponentFromFlag(arg: string): RelativeOpponent {
  if (arg.startsWith("--left-")) {
    return "left";
  }
  if (arg.startsWith("--across-")) {
    return "across";
  }
  if (arg.startsWith("--right-")) {
    return "right";
  }
  throw new Error(`未知对手方向参数：${arg}`);
}

function toCliResult(decision: ReturnType<typeof chooseAction>, verbose = false): CliResult {
  const best = decision.analysis.candidates[0];
  const result: CliResult = {
    mode: decision.mode,
    action: decision.action,
    explanation: decision.explanation,
    recommendedCandidate: best ? {
      discard: best.discard,
      shanten: best.shanten,
      totalWaits: best.totalWaits,
      score: best.score,
      scoreBreakdown: best.scoreBreakdown,
      reasons: best.reasons,
    } : undefined,
  };
  if (verbose) {
    result.analysis = decision.analysis;
  }
  return result;
}

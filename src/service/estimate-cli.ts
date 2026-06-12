import { readFileSync } from "node:fs";

import { DEFAULT_RULE_CONFIG } from "../core/rules.ts";
import type { Call, Discard, GameState, PlayerState } from "../core/state.ts";
import { parseTileGroupsWithRed, parseTileId, type TileId, type WindTile } from "../core/tile.ts";
import { buildVisibleTilesFromState } from "../strategy/choose-action.ts";
import { estimateDiscardActions } from "./estimate.ts";
import { nextValue, parseNonNegativeInteger, parseTileList, parseWind } from "./cli-common.ts";

declare const process: {
  argv: string[];
  exitCode?: number;
};

interface CliOptions {
  text?: string;
  statePath?: string;
  mode?: "fast" | "balanced" | "deep";
  discard?: TileId;
  draw?: TileId;
  turn?: number;
  doraIndicators?: TileId[];
  includeCandidates?: boolean;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const state = options.statePath ? loadState(options.statePath) : buildStateFromOptions(options);
  const result = estimateDiscardActions({
    state,
    mode: options.mode,
    discard: options.discard,
    includeCandidates: options.includeCandidates,
  });
  console.log(JSON.stringify(result));
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {};
  let positionalTextSet = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--") && !positionalTextSet) {
      options.text = arg;
      positionalTextSet = true;
    } else if (arg === "--hand") {
      options.text = nextValue(args, ++i, arg);
    } else if (arg === "--state") {
      options.statePath = nextValue(args, ++i, arg);
    } else if (arg === "--mode") {
      options.mode = parseMode(nextValue(args, ++i, arg));
    } else if (arg === "--discard") {
      options.discard = parseTileId(nextValue(args, ++i, arg));
    } else if (arg === "--draw") {
      options.draw = parseTileId(nextValue(args, ++i, arg));
    } else if (arg === "--turn") {
      options.turn = parseNonNegativeInteger(nextValue(args, ++i, arg), arg);
    } else if (arg === "--dora") {
      options.doraIndicators = parseTileList(nextValue(args, ++i, arg));
    } else if (arg === "--include-candidates") {
      options.includeCandidates = true;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  return options;
}

function parseMode(value: string): "fast" | "balanced" | "deep" {
  if (value === "fast" || value === "balanced" || value === "deep") {
    return value;
  }
  throw new Error(`--mode 必须是 fast/balanced/deep，收到：${value}`);
}

function loadState(path: string): GameState {
  return JSON.parse(readFileSync(path, "utf8")) as GameState;
}

function buildStateFromOptions(options: CliOptions): GameState {
  const parsedHand = parseTileGroupsWithRed(options.text ?? "345m35p13789s1234z");
  const self: PlayerState = {
    seatWind: "1z",
    points: 25000,
    hand: parsedHand.tiles,
    calls: [],
    discards: [],
    riichi: false,
    ippatsu: false,
    menzen: true,
  };
  const opponents = (["2z", "3z", "4z"] as WindTile[]).map(makeOpponent);
  const stateWithoutVisible: Omit<GameState, "visibleTiles"> = {
    round: {
      bakaze: "1z",
      kyoku: 1,
      honba: 0,
      riichiSticks: 0,
      turn: options.turn ?? 8,
    },
    self,
    opponents,
    doraIndicators: options.doraIndicators ?? [],
    lastDraw: options.draw,
    rules: DEFAULT_RULE_CONFIG,
  };
  return {
    ...stateWithoutVisible,
    visibleTiles: buildVisibleTilesFromState(stateWithoutVisible),
  };
}

function makeOpponent(seatWind: WindTile): PlayerState {
  const calls: Call[] = [];
  const discards: Discard[] = [];
  return {
    seatWind,
    points: 25000,
    calls,
    discards,
    riichi: false,
    ippatsu: false,
    menzen: true,
  };
}

import type { TileId, WindTile } from "../core/tile.ts";
import { DEFAULT_RULE_CONFIG, type RuleConfig } from "../core/rules.ts";
import type { Call } from "../core/state.ts";
import { scoreHand, parseScoreHandTile } from "./score-hand.ts";
import { HandTextParseError } from "./parse-hand.ts";
import type { AgariMethod } from "../scoring/index.ts";
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

interface CliOptions {
  text: string;
  winningTile: TileId;
  method: AgariMethod;
  verbose?: boolean;
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

try {
  const options = parseArgs(process.argv.slice(2));
  const result = scoreHand(options);
  console.log(JSON.stringify(result));
} catch (error) {
  if (error instanceof HandTextParseError || error instanceof Error) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}

function parseArgs(args: string[]): CliOptions {
  const text = args[0] ?? "123m456m789p234s22z";
  const winningTile = parseScoreHandTile(args[1] ?? "4s");
  const method = parseMethod(args[2] ?? "ron");
  const options: CliOptions = { text, winningTile, method };

  for (let i = 3; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--riichi") {
      options.riichi = true;
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "--double-riichi") {
      options.doubleRiichi = true;
    } else if (arg === "--ippatsu") {
      options.ippatsu = true;
    } else if (arg === "--rinshan") {
      options.rinshan = true;
    } else if (arg === "--chankan") {
      options.chankan = true;
    } else if (arg === "--haitei") {
      options.haitei = true;
    } else if (arg === "--houtei") {
      options.houtei = true;
    } else if (arg === "--tenhou") {
      options.tenhou = true;
    } else if (arg === "--chiihou") {
      options.chiihou = true;
    } else if (arg === "--double-yakuman") {
      options.rules = {
        ...(options.rules ?? DEFAULT_RULE_CONFIG),
        countDoubleYakuman: true,
      };
    } else if (arg === "--seat") {
      options.seatWind = parseWind(nextValue(args, ++i, arg));
    } else if (arg === "--round") {
      options.bakaze = parseWind(nextValue(args, ++i, arg));
    } else if (arg === "--honba") {
      options.honba = parseNonNegativeInteger(nextValue(args, ++i, arg), arg);
    } else if (arg === "--riichi-sticks") {
      options.riichiSticks = parseNonNegativeInteger(nextValue(args, ++i, arg), arg);
    } else if (arg === "--dora") {
      options.doraIndicators = parseTileList(nextValue(args, ++i, arg));
    } else if (arg === "--ura") {
      options.uraDoraIndicators = parseTileList(nextValue(args, ++i, arg));
    } else if (arg === "--call") {
      const parsed = parseCallWithRed(nextValue(args, ++i, arg));
      options.calls = [...(options.calls ?? []), parsed.call];
      options.akaDoraCount = (options.akaDoraCount ?? 0) + parsed.akaDoraCount;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  return options;
}

function parseMethod(value: string): AgariMethod {
  if (value === "ron" || value === "tsumo") {
    return value;
  }
  throw new Error(`和牌方式必须是 ron 或 tsumo，收到：${value}`);
}

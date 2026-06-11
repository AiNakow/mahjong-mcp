import { analyzeNanikiru, NanikiruParseError } from "./nanikiru.ts";
import { DEFAULT_RULE_CONFIG, type RuleConfig } from "../core/rules.ts";
import type { Call } from "../core/state.ts";
import type { TileId, WindTile } from "../core/tile.ts";
import type { ShantenMode } from "../hand/paili.ts";
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
  mode?: ShantenMode;
  verbose?: boolean;
  calls?: Call[];
  seatWind?: WindTile;
  bakaze?: WindTile;
  rules?: RuleConfig;
  honba?: number;
  riichiSticks?: number;
  doraIndicators?: TileId[];
  uraDoraIndicators?: TileId[];
  akaDoraCount?: number;
}

try {
  const result = analyzeNanikiru(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result));
} catch (error) {
  if (error instanceof NanikiruParseError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    text: args[0] ?? "3456m3455p123788s",
  };

  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--mode") {
      options.mode = parseMode(nextValue(args, ++i, arg));
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "--double-yakuman") {
      options.rules = {
        ...(options.rules ?? DEFAULT_RULE_CONFIG),
        countDoubleYakuman: true,
      };
    } else if (arg === "--no-kuitan") {
      options.rules = {
        ...(options.rules ?? DEFAULT_RULE_CONFIG),
        kuitan: false,
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

function parseMode(value: string): ShantenMode {
  if (value === "0" || value === "1") {
    return Number(value) as ShantenMode;
  }
  throw new Error(`向听模式必须是 0 或 1，收到：${value}`);
}

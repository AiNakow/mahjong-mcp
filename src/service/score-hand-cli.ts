import type { TileId, WindTile } from "../core/tile.ts";
import { parseTileGroups, parseTileId } from "../core/tile.ts";
import { DEFAULT_RULE_CONFIG, type RuleConfig } from "../core/rules.ts";
import type { Call, CallFrom, CallType } from "../core/state.ts";
import { scoreHand, parseScoreHandTile } from "./score-hand.ts";
import { HandTextParseError } from "./parse-hand.ts";
import type { AgariMethod } from "../scoring/index.ts";

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
      options.doraIndicators = parseTileGroups(nextValue(args, ++i, arg));
    } else if (arg === "--ura") {
      options.uraDoraIndicators = parseTileGroups(nextValue(args, ++i, arg));
    } else if (arg === "--aka") {
      options.akaDoraCount = parseNonNegativeInteger(nextValue(args, ++i, arg), arg);
    } else if (arg === "--call") {
      options.calls = [...(options.calls ?? []), parseCall(nextValue(args, ++i, arg))];
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  return options;
}

function parseCall(value: string): Call {
  const [typeValue, tilesValue, calledTileValue, fromValue] = value.split(":");
  const type = parseCallType(typeValue);
  if (!tilesValue) {
    throw new Error(`副露参数必须形如 type:tiles[:calledTile[:from]]，收到：${value}`);
  }
  const tiles = parseTileGroups(tilesValue);
  const calledTile = calledTileValue ? parseTileId(calledTileValue) : undefined;
  const from = fromValue ? parseCallFrom(fromValue) : undefined;
  return { type, tiles, calledTile, from };
}

function parseCallType(value: string): CallType {
  if (
    value === "chi"
    || value === "pon"
    || value === "minkan"
    || value === "ankan"
    || value === "kakan"
  ) {
    return value;
  }
  throw new Error(`副露类型必须是 chi/pon/minkan/ankan/kakan，收到：${value}`);
}

function parseCallFrom(value: string): CallFrom {
  if (value === "left" || value === "across" || value === "right" || value === "self") {
    return value;
  }
  throw new Error(`副露来源必须是 left/across/right/self，收到：${value}`);
}

function parseMethod(value: string): AgariMethod {
  if (value === "ron" || value === "tsumo") {
    return value;
  }
  throw new Error(`和牌方式必须是 ron 或 tsumo，收到：${value}`);
}

function parseWind(value: string): WindTile {
  const tile = parseScoreHandTile(value);
  if (tile === "1z" || tile === "2z" || tile === "3z" || tile === "4z") {
    return tile;
  }
  throw new Error(`风牌必须是 1z/2z/3z/4z，收到：${value}`);
}

function parseNonNegativeInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${option} 必须是非负整数，收到：${value}`);
  }
  return parsed;
}

function nextValue(args: readonly string[], index: number, option: string): string {
  const value = args[index];
  if (!value) {
    throw new Error(`${option} 缺少参数值`);
  }
  return value;
}

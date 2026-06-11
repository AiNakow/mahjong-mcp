import { parseTileGroups, parseTileGroupsWithRed, parseTileId } from "../core/tile.ts";
import type { TileId, WindTile } from "../core/tile.ts";
import type { Call, CallFrom, CallType } from "../core/state.ts";

export function parseCall(value: string): Call {
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

export interface ParsedCall {
  call: Call;
  akaDoraCount: number;
}

export function parseCallWithRed(value: string): ParsedCall {
  const [typeValue, tilesValue, calledTileValue, fromValue] = value.split(":");
  const type = parseCallType(typeValue);
  if (!tilesValue) {
    throw new Error(`副露参数必须形如 type:tiles[:calledTile[:from]]，收到：${value}`);
  }
  const parsedTiles = parseTileGroupsWithRed(tilesValue);
  const calledTile = calledTileValue ? parseTileId(calledTileValue) : undefined;
  const from = fromValue ? parseCallFrom(fromValue) : undefined;
  return {
    call: { type, tiles: parsedTiles.tiles, calledTile, from },
    akaDoraCount: parsedTiles.akaDoraCount,
  };
}

export function parseWind(value: string): WindTile {
  const tile = parseTileId(value);
  if (tile === "1z" || tile === "2z" || tile === "3z" || tile === "4z") {
    return tile;
  }
  throw new Error(`风牌必须是 1z/2z/3z/4z，收到：${value}`);
}

export function parseNonNegativeInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${option} 必须是非负整数，收到：${value}`);
  }
  return parsed;
}

export function nextValue(args: readonly string[], index: number, option: string): string {
  const value = args[index];
  if (!value) {
    throw new Error(`${option} 缺少参数值`);
  }
  return value;
}

export function parseTileList(value: string): TileId[] {
  return parseTileGroups(value);
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

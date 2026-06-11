import {
  parseTileGroups,
  TILE_INDEX,
  TILES_34,
  type TileId,
} from "../core/tile.ts";
import {
  assertCounts34,
  countTiles,
  tilesToCounts34,
  type Counts34,
} from "../core/counts.ts";

export { TILE_INDEX, TILES_34, type TileId };

export type AnalysisKind = "discard" | "draw";
export type ShantenMode = 0 | 1;

export interface TileInfo {
  id: TileId;
  remaining: number;
}

export interface DiscardInfo {
  discard: TileInfo;
  shanten: number;
  total_waits: number;
  good_shape_count: number;
  good_shape_draws: TileId[];
  waits: TileInfo[];
}

export interface AnalysisResult {
  kind: AnalysisKind;
  tile_count: number;
  hand: TileId[];
  shanten: number;
  is_tenpai: boolean;
  is_agari: boolean;
  total_draws: number;
  good_shape_count: number;
  good_shape_draws: TileId[];
  discards: DiscardInfo[];
  draws: TileInfo[];
}

type BlockState = readonly [melds: number, taatsu: number, pairs: number];

export interface AnalyzeOptions {
  includeShantenBack?: boolean;
  unavailableTiles?: readonly TileId[];
}

export class MahjongHandError extends Error {
  constructor(hand: string) {
    super(`非法手牌：${hand}`);
    this.name = "MahjongHandError";
  }
}

const YAO_JIU_INDICES = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
const BLOCK_CACHE = new Map<string, ReadonlyArray<BlockState>>();
const EMPTY_COUNTS_34 = Array(34).fill(0) as readonly number[];

export function isValidHandstr(handStr: string): boolean {
  const normalized = handStr.trim();
  if (!normalized) {
    return false;
  }

  if (!/^([0-9]+[mps]|[1-7]+z)+$/.test(normalized)) {
    return false;
  }

  let handList: TileId[];
  try {
    handList = parseTileGroups(normalized);
  } catch {
    return false;
  }
  const count = handList.length;
  if (count > 14) {
    return false;
  }
  if (count % 3 === 2) {
    if (Math.floor(count / 3) === 0) {
      return false;
    }
  } else if (count % 3 === 0) {
    return false;
  }

  const tileCounter = new Map<TileId, number>();
  for (const tile of handList) {
    tileCounter.set(tile, (tileCounter.get(tile) ?? 0) + 1);
  }

  for (const countValue of tileCounter.values()) {
    if (countValue > 4) {
      return false;
    }
  }

  return true;
}

export function strToCount(handStr: string): number[] {
  return tilesToCounts34(parseTileGroups(handStr));
}

export function strToList(handStr: string): TileId[] {
  return parseTileGroups(handStr);
}

export function analyzeBlock(blockCount: readonly number[], allowSequence: boolean): ReadonlyArray<BlockState> {
  const cacheKey = `${allowSequence ? 1 : 0}:${blockCount.join("")}`;
  const cached = BLOCK_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result = new Map<string, BlockState>();

  function addState(melds: number, taatsu: number, pairs: number): void {
    const state: BlockState = [melds, taatsu, Math.min(pairs, 1)];
    result.set(state.join(","), state);
  }

  function search(
    currentCount: number[],
    start: number,
    melds: number,
    taatsu: number,
    pairs: number,
    remainingCount: number,
  ): void {
    if (remainingCount === 0) {
      addState(melds, taatsu, pairs);
      return;
    }

    let index = start;
    while (index < currentCount.length && currentCount[index] === 0) {
      index += 1;
    }

    if (index >= currentCount.length) {
      addState(melds, taatsu, pairs);
      return;
    }

    if (currentCount[index] >= 3) {
      currentCount[index] -= 3;
      search(currentCount, index, melds + 1, taatsu, pairs, remainingCount - 3);
      currentCount[index] += 3;
    }

    if (
      allowSequence
      && index <= 6
      && currentCount[index + 1] > 0
      && currentCount[index + 2] > 0
    ) {
      currentCount[index] -= 1;
      currentCount[index + 1] -= 1;
      currentCount[index + 2] -= 1;
      search(currentCount, index, melds + 1, taatsu, pairs, remainingCount - 3);
      currentCount[index] += 1;
      currentCount[index + 1] += 1;
      currentCount[index + 2] += 1;
    }

    if (allowSequence && index <= 7 && currentCount[index + 1] > 0) {
      currentCount[index] -= 1;
      currentCount[index + 1] -= 1;
      search(currentCount, index, melds, taatsu + 1, pairs, remainingCount - 2);
      currentCount[index] += 1;
      currentCount[index + 1] += 1;
    }

    if (allowSequence && index <= 6 && currentCount[index + 2] > 0) {
      currentCount[index] -= 1;
      currentCount[index + 2] -= 1;
      search(currentCount, index, melds, taatsu + 1, pairs, remainingCount - 2);
      currentCount[index] += 1;
      currentCount[index + 2] += 1;
    }

    if (currentCount[index] >= 2) {
      currentCount[index] -= 2;
      search(currentCount, index, melds, taatsu + 1, pairs, remainingCount - 2);
      currentCount[index] += 2;
    }

    if (currentCount[index] >= 2) {
      currentCount[index] -= 2;
      search(currentCount, index, melds, taatsu, pairs + 1, remainingCount - 2);
      currentCount[index] += 2;
    }

    currentCount[index] -= 1;
    search(currentCount, index, melds, taatsu, pairs, remainingCount - 1);
    currentCount[index] += 1;
  }

  search([...blockCount], 0, 0, 0, 0, sum(blockCount));

  const states = [...result.values()];
  BLOCK_CACHE.set(cacheKey, states);
  return states;
}

export function pruneStates(states: Iterable<BlockState>): BlockState[] {
  const best = new Map<string, number>();

  for (const [melds, taatsu, pairs] of states) {
    const key = `${melds},${pairs}`;
    const previousTaatsu = best.get(key);
    if (previousTaatsu === undefined || taatsu > previousTaatsu) {
      best.set(key, taatsu);
    }
  }

  return [...best.entries()].map(([key, taatsu]) => {
    const [melds, pairs] = key.split(",").map(Number);
    return [melds, taatsu, pairs] as BlockState;
  });
}

export function calculateStandardShantenDp(handCountInput: readonly number[]): number {
  const handCount = [...handCountInput];
  const blocks = [
    analyzeBlock(handCount.slice(0, 9), true),
    analyzeBlock(handCount.slice(9, 18), true),
    analyzeBlock(handCount.slice(18, 27), true),
    analyzeBlock(handCount.slice(27, 34), false),
  ];

  const targetMelds = Math.floor(sum(handCount) / 3);
  let states: BlockState[] = [[0, 0, 0]];

  for (const blockStates of blocks) {
    const nextStates: BlockState[] = [];
    for (const a of states) {
      for (const b of blockStates) {
        const melds = Math.min(a[0] + b[0], targetMelds);
        const taatsu = Math.min(a[1] + b[1], targetMelds - melds);
        const pairs = Math.min(1, a[2] + b[2]);
        nextStates.push([melds, taatsu, pairs]);
      }
    }
    states = pruneStates(nextStates);
  }

  let bestShanten = 8;
  for (const [melds, taatsu, pairs] of states) {
    const usefulTaatsu = Math.min(taatsu, targetMelds - melds);
    bestShanten = Math.min(
      bestShanten,
      2 * targetMelds - 2 * melds - usefulTaatsu - Math.min(pairs, 1),
    );
  }

  return bestShanten;
}

export function calculateChiitoiShanten(handCount: readonly number[]): number {
  return 6 - handCount.filter((n) => Math.floor(n / 2) > 0).length;
}

export function calculateKokushiShanten(handCount: readonly number[]): number {
  const hasPair = YAO_JIU_INDICES.some((index) => Math.floor(handCount[index] / 2) > 0);
  const unique = YAO_JIU_INDICES.filter((index) => handCount[index] > 0).length;
  return 13 - unique - (hasPair ? 1 : 0);
}

export function analyzeDraws(
  handCount: readonly number[],
  mode: ShantenMode,
  shantenCache?: Map<string, number>,
): number {
  const cacheKey = `${handCount.join("")}:${mode}`;
  const cached = shantenCache?.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const standardShanten = calculateStandardShantenDp(handCount);
  const result = mode === 0
    ? Math.min(
      standardShanten,
      calculateChiitoiShanten(handCount),
      calculateKokushiShanten(handCount),
    )
    : standardShanten;

  shantenCache?.set(cacheKey, result);
  return result;
}

export function getDraws(
  handCount: number[],
  shanten: number,
  mode: ShantenMode,
  shantenCache?: Map<string, number>,
  unavailableCount: readonly number[] = EMPTY_COUNTS_34,
): TileInfo[] {
  const draws: TileInfo[] = [];
  for (let i = 0; i < handCount.length; i += 1) {
    if (handCount[i] >= 4) {
      continue;
    }

    handCount[i] += 1;
    const newShanten = analyzeDraws(handCount, mode, shantenCache);
    handCount[i] -= 1;

    if (newShanten < shanten) {
      draws.push({
        id: TILES_34[i],
        remaining: Math.max(0, 4 - handCount[i] - unavailableCount[i]),
      });
    }
  }

  return draws.filter((draw) => draw.remaining > 0);
}

export function hasMoreWaitsThan(
  handCount: number[],
  shanten: number,
  mode: ShantenMode,
  limit: number,
  shantenCache?: Map<string, number>,
  unavailableCount: readonly number[] = EMPTY_COUNTS_34,
): boolean {
  let totalWaits = 0;
  for (let i = 0; i < handCount.length; i += 1) {
    if (handCount[i] >= 4) {
      continue;
    }

    handCount[i] += 1;
    const newShanten = analyzeDraws(handCount, mode, shantenCache);
    handCount[i] -= 1;

    if (newShanten < shanten) {
      totalWaits += Math.max(0, 4 - handCount[i] - unavailableCount[i]);
      if (totalWaits > limit) {
        return true;
      }
    }
  }

  return false;
}

export function getGoodShapeCount(
  handCount: number[],
  draws: readonly TileInfo[],
  shanten: number,
  mode: ShantenMode,
  shantenCache?: Map<string, number>,
  unavailableCount: readonly number[] = EMPTY_COUNTS_34,
): [count: number, draws: TileId[]] {
  let goodShapeCount = 0;
  const goodShapeDraws: TileId[] = [];

  for (const draw of draws) {
    const drawIndex = TILE_INDEX[draw.id];
    handCount[drawIndex] += 1;

    for (let i = 0; i < handCount.length; i += 1) {
      if (handCount[i] <= 0) {
        continue;
      }

      handCount[i] -= 1;
      const hasGoodWaits = hasMoreWaitsThan(handCount, shanten - 1, mode, 4, shantenCache, unavailableCount);
      handCount[i] += 1;

      if (hasGoodWaits) {
        goodShapeCount += draw.remaining;
        goodShapeDraws.push(draw.id);
        break;
      }
    }

    handCount[drawIndex] -= 1;
  }

  return [goodShapeCount, goodShapeDraws];
}

export function analyzeHand(
  handStr: string,
  mode: ShantenMode = 0,
  options: AnalyzeOptions = {},
): AnalysisResult {
  if (!isValidHandstr(handStr)) {
    throw new MahjongHandError(handStr);
  }

  const handCount = strToCount(handStr);
  return analyzeCounts(handCount, strToList(handStr), mode, options);
}

export function analyzeTiles(
  tiles: readonly TileId[],
  mode: ShantenMode = 0,
  options: AnalyzeOptions = {},
): AnalysisResult {
  return analyzeCounts(tilesToCounts34(tiles), tiles, mode, options);
}

export function analyzeCounts(
  handCountInput: readonly number[],
  hand: readonly TileId[],
  mode: ShantenMode = 0,
  options: AnalyzeOptions = {},
): AnalysisResult {
  assertCounts34(handCountInput);

  const shantenCache = new Map<string, number>();
  const analysisResult = createEmptyAnalysisResult();
  const handCount = [...handCountInput] as Counts34;
  const unavailableCount = options.unavailableTiles
    ? tilesToCounts34(options.unavailableTiles)
    : EMPTY_COUNTS_34;
  const tileCount = countTiles(handCount);
  if (hand.length !== tileCount) {
    throw new Error(`Hand tile list length ${hand.length} does not match Counts34 total ${tileCount}`);
  }

  analysisResult.tile_count = tileCount;
  analysisResult.hand = [...hand];

  if (tileCount % 3 === 1) {
    analysisResult.kind = "draw";
    analysisResult.shanten = analyzeDraws(handCount, mode, shantenCache);
    analysisResult.draws = getDraws(handCount, analysisResult.shanten, mode, shantenCache, unavailableCount);
    analysisResult.is_tenpai = analysisResult.shanten <= 0;
    analysisResult.total_draws = sum(analysisResult.draws.map((draw) => draw.remaining));

    if (analysisResult.shanten === 1) {
      const [goodShapeCount, goodShapeDraws] = getGoodShapeCount(
        handCount,
        analysisResult.draws,
        analysisResult.shanten,
        mode,
        shantenCache,
        unavailableCount,
      );
      analysisResult.good_shape_count = goodShapeCount;
      analysisResult.good_shape_draws = goodShapeDraws;
    }
  } else if (tileCount % 3 === 2) {
    analysisResult.kind = "discard";
    const discardsShanten = Array(34).fill(8) as number[];
    let bestShanten = 8;

    for (let i = 0; i < handCount.length; i += 1) {
      if (handCount[i] <= 0) {
        continue;
      }

      handCount[i] -= 1;
      discardsShanten[i] = analyzeDraws(handCount, mode, shantenCache);
      handCount[i] += 1;
      bestShanten = Math.min(bestShanten, discardsShanten[i]);
    }

    const discards: DiscardInfo[] = [];
    for (let i = 0; i < discardsShanten.length; i += 1) {
      if (handCount[i] <= 0) {
        continue;
      }
      if (!options.includeShantenBack && discardsShanten[i] !== bestShanten) {
        continue;
      }

      const discardShanten = discardsShanten[i];
      const discardInfo: DiscardInfo = {
        discard: {
          id: TILES_34[i],
          remaining: 4 - handCount[i],
        },
        shanten: discardShanten,
        total_waits: 0,
        good_shape_count: 0,
        good_shape_draws: [],
        waits: [],
      };

      handCount[i] -= 1;
      discardInfo.waits = getDraws(handCount, discardShanten, mode, shantenCache, unavailableCount);
      handCount[i] += 1;

      const selfDrawWait = discardInfo.waits.find((wait) => wait.id === TILES_34[i]);
      if (selfDrawWait) {
        selfDrawWait.remaining -= 1;
      }

      discardInfo.total_waits = sum(discardInfo.waits.map((wait) => wait.remaining));
      discards.push(discardInfo);
    }

    analysisResult.shanten = bestShanten;

    if (analysisResult.shanten === 1 || options.includeShantenBack) {
      for (const discard of discards) {
        const discardIndex = TILE_INDEX[discard.discard.id];
        handCount[discardIndex] -= 1;
        const [goodShapeCount, goodShapeDraws] = getGoodShapeCount(
          handCount,
          discard.waits,
          discard.shanten,
          mode,
          shantenCache,
          unavailableCount,
        );
        discard.good_shape_count = goodShapeCount;
        discard.good_shape_draws = goodShapeDraws;
        handCount[discardIndex] += 1;
      }
    }

    analysisResult.discards = discards.sort((a, b) => (
      a.shanten - b.shanten || b.total_waits - a.total_waits
    ));
    analysisResult.is_tenpai = analysisResult.shanten <= 0;
    analysisResult.is_agari = analyzeDraws(handCount, mode, shantenCache) < 0;
  }

  return analysisResult;
}

function createEmptyAnalysisResult(): AnalysisResult {
  return {
    kind: "discard",
    tile_count: 0,
    hand: [],
    shanten: 8,
    is_tenpai: false,
    is_agari: false,
    total_draws: 0,
    good_shape_count: 0,
    good_shape_draws: [],
    discards: [],
    draws: [],
  };
}

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total;
}

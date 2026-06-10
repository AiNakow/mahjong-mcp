import { assertCounts34, countTiles, tilesToCounts34, type Counts34 } from "../core/counts.ts";
import { TILE_INDEX, TILES_34, type TileId } from "../core/tile.ts";
import type { Call } from "../core/state.ts";
import type {
  AgariDecomposition,
  MeldShape,
  WaitKind,
} from "./types.ts";

const TERMINAL_HONOR_INDICES = new Set([0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]);

export function decomposeAgari(
  hand: readonly TileId[] | readonly number[],
  winningTile: TileId,
  calls: readonly Call[] = [],
): AgariDecomposition[] {
  const counts = toCounts34(hand);
  assertCounts34(counts);

  const callMelds = calls.map(callToMeldShape);
  if (callMelds.some((meld) => meld === undefined)) {
    return [];
  }
  const validCallMelds = callMelds as MeldShape[];
  const requiredConcealedMelds = 4 - validCallMelds.length;
  if (requiredConcealedMelds < 0) {
    return [];
  }

  const totalTiles = countTiles(counts) + calls.reduce((total, call) => total + call.tiles.length, 0);
  if (totalTiles !== 14 && totalTiles !== 15 && totalTiles !== 16 && totalTiles !== 17 && totalTiles !== 18) {
    return [];
  }

  const decompositions: AgariDecomposition[] = [];

  if (calls.length === 0) {
    decompositions.push(...decomposeChiitoi(counts, winningTile));
    decompositions.push(...decomposeKokushi(counts, winningTile));
  }

  decompositions.push(...decomposeStandard(counts, winningTile, validCallMelds, requiredConcealedMelds));

  return dedupeDecompositions(decompositions);
}

function toCounts34(hand: readonly TileId[] | readonly number[]): Counts34 {
  if (hand.length === 34 && hand.every((value) => typeof value === "number")) {
    return [...hand] as Counts34;
  }
  return tilesToCounts34(hand as readonly TileId[]);
}

function decomposeChiitoi(counts: readonly number[], winningTile: TileId): AgariDecomposition[] {
  if (countTiles(counts) !== 14) {
    return [];
  }
  const pairs = counts.filter((count) => count === 2).length;
  if (pairs !== 7) {
    return [];
  }

  return [{
    kind: "chiitoi",
    pair: winningTile,
    melds: [],
    winningTile,
    wait: "tanki",
  }];
}

function decomposeKokushi(counts: readonly number[], winningTile: TileId): AgariDecomposition[] {
  if (countTiles(counts) !== 14) {
    return [];
  }
  for (let i = 0; i < counts.length; i += 1) {
    const isTerminalHonor = TERMINAL_HONOR_INDICES.has(i);
    if (!isTerminalHonor && counts[i] > 0) {
      return [];
    }
    if (isTerminalHonor && counts[i] === 0) {
      return [];
    }
  }

  const pairIndices = [...TERMINAL_HONOR_INDICES].filter((index) => counts[index] === 2);
  if (pairIndices.length !== 1) {
    return [];
  }

  return [{
    kind: "kokushi",
    pair: TILES_34[pairIndices[0]],
    melds: [],
    winningTile,
    wait: counts[TILE_INDEX[winningTile]] === 2 ? "kokushi_13" : "tanki",
  }];
}

function decomposeStandard(
  counts: readonly number[],
  winningTile: TileId,
  callMelds: readonly MeldShape[],
  requiredConcealedMelds: number,
): AgariDecomposition[] {
  const result: AgariDecomposition[] = [];
  if (countTiles(counts) !== requiredConcealedMelds * 3 + 2) {
    return result;
  }

  for (let pairIndex = 0; pairIndex < counts.length; pairIndex += 1) {
    if (counts[pairIndex] < 2) {
      continue;
    }

    const work = [...counts];
    work[pairIndex] -= 2;
    const concealedMelds: MeldShape[] = [];
    searchMelds(work, requiredConcealedMelds, concealedMelds, (melds) => {
      const allMelds = [...melds, ...callMelds];
      const waits = detectWaits(TILES_34[pairIndex], allMelds, winningTile);
      for (const wait of waits) {
        result.push({
          kind: "standard",
          pair: TILES_34[pairIndex],
          melds: allMelds,
          winningTile,
          winningMeldIndex: wait.meldIndex,
          wait: wait.kind,
        });
      }
    });
  }

  return result;
}

function searchMelds(
  counts: number[],
  targetMelds: number,
  current: MeldShape[],
  emit: (melds: MeldShape[]) => void,
): void {
  if (current.length === targetMelds) {
    if (counts.every((count) => count === 0)) {
      emit(current.map((meld) => ({ ...meld, tiles: [...meld.tiles] })));
    }
    return;
  }

  const index = counts.findIndex((count) => count > 0);
  if (index < 0) {
    return;
  }

  if (counts[index] >= 3) {
    counts[index] -= 3;
    current.push({
      kind: "triplet",
      tiles: [TILES_34[index], TILES_34[index], TILES_34[index]],
      source: "concealed",
    });
    searchMelds(counts, targetMelds, current, emit);
    current.pop();
    counts[index] += 3;
  }

  if (index < 27 && index % 9 <= 6 && counts[index + 1] > 0 && counts[index + 2] > 0) {
    counts[index] -= 1;
    counts[index + 1] -= 1;
    counts[index + 2] -= 1;
    current.push({
      kind: "sequence",
      tiles: [TILES_34[index], TILES_34[index + 1], TILES_34[index + 2]],
      source: "concealed",
    });
    searchMelds(counts, targetMelds, current, emit);
    current.pop();
    counts[index] += 1;
    counts[index + 1] += 1;
    counts[index + 2] += 1;
  }
}

function detectWaits(
  pair: TileId,
  melds: readonly MeldShape[],
  winningTile: TileId,
): Array<{ kind: WaitKind; meldIndex?: number }> {
  const waits: Array<{ kind: WaitKind; meldIndex?: number }> = [];
  if (pair === winningTile) {
    waits.push({ kind: "tanki" });
  }

  for (let i = 0; i < melds.length; i += 1) {
    const meld = melds[i];
    if (!meld.tiles.includes(winningTile)) {
      continue;
    }
    if (meld.kind === "triplet" || meld.kind === "quad") {
      waits.push({ kind: "shanpon", meldIndex: i });
      continue;
    }
    waits.push({ kind: detectSequenceWait(meld.tiles, winningTile), meldIndex: i });
  }

  return waits.length > 0 ? waits : [{ kind: "ryanmen" }];
}

function detectSequenceWait(sequence: readonly TileId[], winningTile: TileId): WaitKind {
  const sorted = [...sequence].sort((a, b) => TILE_INDEX[a] - TILE_INDEX[b]);
  const first = sorted[0];
  const winningRank = Number(winningTile[0]);
  const firstRank = Number(first[0]);
  if (winningRank === firstRank + 1) {
    return "kanchan";
  }
  if ((firstRank === 1 && winningRank === 3) || (firstRank === 7 && winningRank === 7)) {
    return "penchan";
  }
  return "ryanmen";
}

function callToMeldShape(call: Call): MeldShape | undefined {
  const source = call.type === "ankan" ? "ankan" : "open";
  if (call.type === "chi") {
    if (!isValidChi(call.tiles)) {
      return undefined;
    }
    return {
      kind: "sequence",
      tiles: [...call.tiles].sort((a, b) => TILE_INDEX[a] - TILE_INDEX[b]),
      source,
    };
  }
  if (call.type === "pon" && !isSameTileSet(call.tiles, 3)) {
    return undefined;
  }
  if ((call.type === "minkan" || call.type === "ankan" || call.type === "kakan") && !isSameTileSet(call.tiles, 4)) {
    return undefined;
  }
  return {
    kind: call.type === "minkan" || call.type === "ankan" || call.type === "kakan" ? "quad" : "triplet",
    tiles: [...call.tiles],
    source,
  };
}

function isValidChi(tiles: readonly TileId[]): boolean {
  if (tiles.length !== 3 || tiles.some((tile) => tile[1] === "z")) {
    return false;
  }
  const sorted = [...tiles].sort((a, b) => TILE_INDEX[a] - TILE_INDEX[b]);
  return sorted.every((tile) => tile[1] === sorted[0][1])
    && TILE_INDEX[sorted[1]] === TILE_INDEX[sorted[0]] + 1
    && TILE_INDEX[sorted[2]] === TILE_INDEX[sorted[0]] + 2;
}

function isSameTileSet(tiles: readonly TileId[], expectedLength: number): boolean {
  return tiles.length === expectedLength && tiles.every((tile) => tile === tiles[0]);
}

function dedupeDecompositions(decompositions: readonly AgariDecomposition[]): AgariDecomposition[] {
  const seen = new Set<string>();
  const result: AgariDecomposition[] = [];
  for (const decomposition of decompositions) {
    const key = JSON.stringify({
      kind: decomposition.kind,
      pair: decomposition.pair,
      melds: decomposition.melds.map((meld) => [meld.kind, meld.source, meld.tiles.join("")]),
      wait: decomposition.wait,
      winningMeldIndex: decomposition.winningMeldIndex,
    });
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(decomposition);
  }
  return result;
}

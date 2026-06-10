import { DEFAULT_RULE_CONFIG } from "../core/rules.ts";
import type { RuleConfig } from "../core/rules.ts";
import { TILES_34, type TileId } from "../core/tile.ts";
import type { AgariContext, AgariDecomposition, MeldShape, YakuResult } from "./types.ts";

export function evaluateYaku(context: AgariContext, decomposition: AgariDecomposition): YakuResult[] {
  const yaku: YakuResult[] = [];
  const menzen = isMenzen(context);
  const allTiles = collectTiles(context, decomposition);
  const rules = context.rules ?? DEFAULT_RULE_CONFIG;
  const contextYakuman = evaluateContextYakuman(context);

  if (decomposition.kind === "kokushi") {
    yaku.push(...contextYakuman);
    yaku.push({
      id: "kokushi",
      name: decomposition.wait === "kokushi_13" ? "国士无双十三面" : "国士无双",
      han: 0,
      yakuman: yakumanValue(rules, decomposition.wait === "kokushi_13"),
    });
    return yaku;
  }

  if (contextYakuman.length > 0 && decomposition.kind !== "standard") {
    return contextYakuman;
  }

  const yakuman = [...contextYakuman, ...evaluateYakuman(context, decomposition, allTiles, rules)];
  if (yakuman.length > 0) {
    return yakuman;
  }

  if (context.doubleRiichi && menzen) {
    yaku.push({ id: "double_riichi", name: "两立直", han: 2 });
  } else if (context.riichi && menzen) {
    yaku.push({ id: "riichi", name: "立直", han: 1 });
  }
  if (context.ippatsu && (context.riichi || context.doubleRiichi) && menzen) {
    yaku.push({ id: "ippatsu", name: "一发", han: 1 });
  }
  if (context.method === "tsumo" && menzen) {
    yaku.push({ id: "menzen_tsumo", name: "门前清自摸和", han: 1 });
  }
  if (context.rinshan) {
    yaku.push({ id: "rinshan", name: "岭上开花", han: 1 });
  }
  if (context.chankan) {
    yaku.push({ id: "chankan", name: "抢杠", han: 1 });
  }
  if (context.haitei) {
    yaku.push({ id: "haitei", name: "海底摸月", han: 1 });
  }
  if (context.houtei) {
    yaku.push({ id: "houtei", name: "河底捞鱼", han: 1 });
  }

  if (isTanyao(allTiles) && (menzen || rules.kuitan)) {
    yaku.push({ id: "tanyao", name: "断幺九", han: 1 });
  }

  if (decomposition.kind === "chiitoi") {
    yaku.push({ id: "chiitoi", name: "七对子", han: 2 });
  }

  if (decomposition.kind === "standard") {
    yaku.push(...evaluateYakuhai(context, decomposition.melds));
    if (isPinfu(context, decomposition, menzen)) {
      yaku.push({ id: "pinfu", name: "平和", han: 1 });
    }
    const iipeikouCount = countIipeikou(decomposition.melds);
    if (menzen && iipeikouCount >= 2) {
      yaku.push({ id: "ryanpeikou", name: "二杯口", han: 3 });
    } else if (menzen && iipeikouCount > 0) {
      yaku.push({ id: "iipeikou", name: "一杯口", han: 1 });
    }
    if (decomposition.melds.every((meld) => meld.kind === "triplet" || meld.kind === "quad")) {
      yaku.push({ id: "toitoi", name: "对对和", han: 2 });
    }
    const sanshoku = evaluateSanshokuDoujun(decomposition.melds, menzen);
    if (sanshoku) {
      yaku.push(sanshoku);
    }
    const ittsu = evaluateIttsu(decomposition.melds, menzen);
    if (ittsu) {
      yaku.push(ittsu);
    }
    const chanta = evaluateChanta(decomposition, allTiles, menzen);
    if (chanta) {
      yaku.push(chanta);
    }
    if (countSanankou(context, decomposition) >= 3) {
      yaku.push({ id: "sanankou", name: "三暗刻", han: 2 });
    }
    if (isShousangen(context, decomposition)) {
      yaku.push({ id: "shousangen", name: "小三元", han: 2 });
    }
    if (isSanshokuDoukou(decomposition.melds)) {
      yaku.push({ id: "sanshoku_doukou", name: "三色同刻", han: 2 });
    }
    if (countQuads(decomposition.melds) >= 3) {
      yaku.push({ id: "sankantsu", name: "三杠子", han: 2 });
    }
  }

  if (isHonroutou(allTiles)) {
    yaku.push({ id: "honroutou", name: "混老头", han: 2 });
  }

  const flush = evaluateFlush(allTiles, menzen);
  if (flush) {
    yaku.push(flush);
  }

  const dora = countDora(context, rules);
  if (yaku.length > 0 && !yaku.some((item) => item.yakuman)) {
    if (dora.dora > 0) {
      yaku.push({ id: "dora", name: "宝牌", han: dora.dora });
    }
    if (dora.akaDora > 0) {
      yaku.push({ id: "aka_dora", name: "赤宝牌", han: dora.akaDora });
    }
    if (dora.uraDora > 0) {
      yaku.push({ id: "ura_dora", name: "里宝牌", han: dora.uraDora });
    }
  }

  return yaku;
}

export function isMenzen(context: AgariContext): boolean {
  return (context.calls ?? []).every((call) => call.type === "ankan");
}

function collectTiles(context: AgariContext, decomposition: AgariDecomposition): TileId[] {
  if (context.hand.length > 0) {
    return [
      ...context.hand,
      ...(context.calls ?? []).flatMap((call) => call.tiles),
    ];
  }
  return [
    ...(decomposition.pair ? [decomposition.pair, decomposition.pair] : []),
    ...decomposition.melds.flatMap((meld) => meld.tiles),
  ];
}

function isTanyao(tiles: readonly TileId[]): boolean {
  return tiles.every((tile) => {
    const rank = Number(tile[0]);
    return tile[1] !== "z" && rank >= 2 && rank <= 8;
  });
}

function evaluateYakuhai(context: AgariContext, melds: readonly MeldShape[]): YakuResult[] {
  const yaku: YakuResult[] = [];
  for (const meld of melds) {
    if (meld.kind !== "triplet" && meld.kind !== "quad") {
      continue;
    }
    const tile = meld.tiles[0];
    if (tile === "5z") {
      yaku.push({ id: "yakuhai_haku", name: "役牌 白", han: 1 });
    } else if (tile === "6z") {
      yaku.push({ id: "yakuhai_hatsu", name: "役牌 发", han: 1 });
    } else if (tile === "7z") {
      yaku.push({ id: "yakuhai_chun", name: "役牌 中", han: 1 });
    }
    if (tile === context.bakaze) {
      yaku.push({ id: "yakuhai_bakaze", name: "役牌 场风", han: 1 });
    }
    if (tile === context.seatWind) {
      yaku.push({ id: "yakuhai_jikaze", name: "役牌 自风", han: 1 });
    }
  }
  return yaku;
}

function isPinfu(context: AgariContext, decomposition: AgariDecomposition, menzen: boolean): boolean {
  if (!menzen || decomposition.kind !== "standard") {
    return false;
  }
  if (decomposition.wait !== "ryanmen") {
    return false;
  }
  if (!decomposition.melds.every((meld) => meld.kind === "sequence")) {
    return false;
  }
  if (!decomposition.pair) {
    return false;
  }
  return !isValuePair(decomposition.pair, context);
}

export function isValuePair(pair: TileId, context: Pick<AgariContext, "bakaze" | "seatWind">): boolean {
  return pair === "5z" || pair === "6z" || pair === "7z" || pair === context.bakaze || pair === context.seatWind;
}

function evaluateSanshokuDoujun(melds: readonly MeldShape[], menzen: boolean): YakuResult | undefined {
  const startsBySuit = new Map<number, Set<string>>();
  for (const meld of melds) {
    if (meld.kind !== "sequence") {
      continue;
    }
    const first = meld.tiles[0];
    const rank = Number(first[0]);
    const suit = first[1];
    const suits = startsBySuit.get(rank) ?? new Set<string>();
    suits.add(suit);
    startsBySuit.set(rank, suits);
  }
  for (const suits of startsBySuit.values()) {
    if (suits.has("m") && suits.has("p") && suits.has("s")) {
      return { id: "sanshoku_doujun", name: "三色同顺", han: menzen ? 2 : 1 };
    }
  }
  return undefined;
}

function evaluateIttsu(melds: readonly MeldShape[], menzen: boolean): YakuResult | undefined {
  const sequencesBySuit = new Map<string, Set<number>>();
  for (const meld of melds) {
    if (meld.kind !== "sequence") {
      continue;
    }
    const first = meld.tiles[0];
    const suit = first[1];
    const starts = sequencesBySuit.get(suit) ?? new Set<number>();
    starts.add(Number(first[0]));
    sequencesBySuit.set(suit, starts);
  }
  for (const starts of sequencesBySuit.values()) {
    if (starts.has(1) && starts.has(4) && starts.has(7)) {
      return { id: "ittsu", name: "一气通贯", han: menzen ? 2 : 1 };
    }
  }
  return undefined;
}

function evaluateChanta(decomposition: AgariDecomposition, tiles: readonly TileId[], menzen: boolean): YakuResult | undefined {
  if (decomposition.kind !== "standard" || !decomposition.pair) {
    return undefined;
  }
  if (!decomposition.melds.every(hasTerminalOrHonor) || !isTerminalOrHonor(decomposition.pair)) {
    return undefined;
  }
  if (!decomposition.melds.some((meld) => meld.kind === "sequence")) {
    return undefined;
  }
  if (tiles.every((tile) => tile[1] !== "z")) {
    return { id: "junchan", name: "纯全带幺九", han: menzen ? 3 : 2 };
  }
  return { id: "chanta", name: "混全带幺九", han: menzen ? 2 : 1 };
}

function countSanankou(context: AgariContext, decomposition: AgariDecomposition): number {
  let count = 0;
  for (let i = 0; i < decomposition.melds.length; i += 1) {
    const meld = decomposition.melds[i];
    if (meld.kind !== "triplet" && meld.kind !== "quad") {
      continue;
    }
    if (meld.source === "open") {
      continue;
    }
    if (
      context.method === "ron"
      && decomposition.wait === "shanpon"
      && decomposition.winningMeldIndex === i
      && meld.kind === "triplet"
    ) {
      continue;
    }
    count += 1;
  }
  return count;
}

function isShousangen(context: AgariContext, decomposition: AgariDecomposition): boolean {
  if (decomposition.kind !== "standard" || !decomposition.pair) {
    return false;
  }
  const dragonTriplets = countDragonTriplets(decomposition.melds);
  return dragonTriplets === 2 && isDragon(decomposition.pair);
}

function isSanshokuDoukou(melds: readonly MeldShape[]): boolean {
  const ranksBySuit = new Map<number, Set<string>>();
  for (const meld of melds) {
    if (meld.kind !== "triplet" && meld.kind !== "quad") {
      continue;
    }
    const tile = meld.tiles[0];
    if (tile[1] === "z") {
      continue;
    }
    const rank = Number(tile[0]);
    const suits = ranksBySuit.get(rank) ?? new Set<string>();
    suits.add(tile[1]);
    ranksBySuit.set(rank, suits);
  }
  for (const suits of ranksBySuit.values()) {
    if (suits.has("m") && suits.has("p") && suits.has("s")) {
      return true;
    }
  }
  return false;
}

function isHonroutou(tiles: readonly TileId[]): boolean {
  return tiles.every(isTerminalOrHonor) && tiles.some((tile) => tile[1] === "z") && tiles.some((tile) => tile[1] !== "z");
}

function evaluateContextYakuman(context: AgariContext): YakuResult[] {
  const yaku: YakuResult[] = [];
  if (context.tenhou) {
    yaku.push({ id: "tenhou", name: "天和", han: 0, yakuman: 1 });
  }
  if (context.chiihou) {
    yaku.push({ id: "chiihou", name: "地和", han: 0, yakuman: 1 });
  }
  return yaku;
}

function evaluateYakuman(
  context: AgariContext,
  decomposition: AgariDecomposition,
  tiles: readonly TileId[],
  rules: RuleConfig,
): YakuResult[] {
  const yakuman: YakuResult[] = [];
  if (decomposition.kind !== "standard") {
    return yakuman;
  }
  if (countDragonTriplets(decomposition.melds) === 3) {
    yakuman.push({ id: "daisangen", name: "大三元", han: 0, yakuman: 1 });
  }
  if (countSanankou(context, decomposition) === 4) {
    const tanki = decomposition.wait === "tanki";
    yakuman.push({
      id: "suuankou",
      name: tanki ? "四暗刻单骑" : "四暗刻",
      han: 0,
      yakuman: yakumanValue(rules, tanki),
    });
  }
  if (tiles.every((tile) => tile[1] === "z")) {
    yakuman.push({ id: "tsuuiisou", name: "字一色", han: 0, yakuman: 1 });
  }
  if (tiles.every((tile) => tile[1] !== "z" && (tile[0] === "1" || tile[0] === "9"))) {
    yakuman.push({ id: "chinroutou", name: "清老头", han: 0, yakuman: 1 });
  }
  const windTriplets = countWindTriplets(decomposition.melds);
  if (windTriplets === 4) {
    yakuman.push({ id: "daisuushii", name: "大四喜", han: 0, yakuman: yakumanValue(rules, true) });
  } else if (windTriplets === 3 && isWind(decomposition.pair)) {
    yakuman.push({ id: "shousuushii", name: "小四喜", han: 0, yakuman: 1 });
  }
  if (tiles.every(isGreenTile)) {
    yakuman.push({ id: "ryuuiisou", name: "绿一色", han: 0, yakuman: 1 });
  }
  if (countQuads(decomposition.melds) === 4) {
    yakuman.push({ id: "suukantsu", name: "四杠子", han: 0, yakuman: 1 });
  }
  const chuuren = evaluateChuuren(context, decomposition, tiles);
  if (chuuren) {
    yakuman.push({
      id: "chuuren_poutou",
      name: chuuren.pure ? "纯正九莲宝灯" : "九莲宝灯",
      han: 0,
      yakuman: yakumanValue(rules, chuuren.pure),
    });
  }
  return yakuman;
}

function evaluateChuuren(
  context: AgariContext,
  decomposition: AgariDecomposition,
  tiles: readonly TileId[],
): { pure: boolean } | undefined {
  if (!isMenzen(context) || decomposition.kind !== "standard" || tiles.length !== 14) {
    return undefined;
  }
  const suits = new Set(tiles.map((tile) => tile[1]));
  if (suits.size !== 1 || suits.has("z")) {
    return undefined;
  }

  const counts = Array(9).fill(0) as number[];
  for (const tile of tiles) {
    counts[Number(tile[0]) - 1] += 1;
  }
  const base = [3, 1, 1, 1, 1, 1, 1, 1, 3];
  for (let i = 0; i < base.length; i += 1) {
    if (counts[i] < base[i]) {
      return undefined;
    }
  }
  const extraIndex = counts.findIndex((count, index) => count > base[index]);
  return { pure: extraIndex === Number(context.winningTile[0]) - 1 };
}

function countIipeikou(melds: readonly MeldShape[]): number {
  const sequences = new Map<string, number>();
  for (const meld of melds) {
    if (meld.kind !== "sequence" || meld.source !== "concealed") {
      continue;
    }
    const key = meld.tiles.join(",");
    sequences.set(key, (sequences.get(key) ?? 0) + 1);
  }
  let count = 0;
  for (const sequenceCount of sequences.values()) {
    count += Math.floor(sequenceCount / 2);
  }
  return count;
}

function countDragonTriplets(melds: readonly MeldShape[]): number {
  return melds.filter((meld) => (
    (meld.kind === "triplet" || meld.kind === "quad") && isDragon(meld.tiles[0])
  )).length;
}

function countWindTriplets(melds: readonly MeldShape[]): number {
  return melds.filter((meld) => (
    (meld.kind === "triplet" || meld.kind === "quad") && isWind(meld.tiles[0])
  )).length;
}

function countQuads(melds: readonly MeldShape[]): number {
  return melds.filter((meld) => meld.kind === "quad").length;
}

function yakumanValue(rules: RuleConfig, doubleYakumanShape: boolean): number {
  return rules.countDoubleYakuman && doubleYakumanShape ? 2 : 1;
}

function hasTerminalOrHonor(meld: MeldShape): boolean {
  return meld.tiles.some(isTerminalOrHonor);
}

function isTerminalOrHonor(tile: TileId): boolean {
  return tile[1] === "z" || tile[0] === "1" || tile[0] === "9";
}

function isDragon(tile: TileId): boolean {
  return tile === "5z" || tile === "6z" || tile === "7z";
}

function isWind(tile: TileId | undefined): boolean {
  return tile === "1z" || tile === "2z" || tile === "3z" || tile === "4z";
}

function isGreenTile(tile: TileId): boolean {
  return tile === "2s" || tile === "3s" || tile === "4s" || tile === "6s" || tile === "8s" || tile === "6z";
}

function evaluateFlush(tiles: readonly TileId[], menzen: boolean): YakuResult | undefined {
  const suits = new Set(tiles.filter((tile) => tile[1] !== "z").map((tile) => tile[1]));
  if (suits.size !== 1) {
    return undefined;
  }
  const hasHonor = tiles.some((tile) => tile[1] === "z");
  if (hasHonor) {
    return { id: "honitsu", name: "混一色", han: menzen ? 3 : 2 };
  }
  return { id: "chinitsu", name: "清一色", han: menzen ? 6 : 5 };
}

function countDora(context: AgariContext, rules: RuleConfig): { dora: number; akaDora: number; uraDora: number } {
  const tiles = [...context.hand, ...(context.calls ?? []).flatMap((call) => call.tiles)];
  const dora = countIndicatorDora(tiles, context.doraIndicators ?? []);
  const uraDora = (context.riichi || context.doubleRiichi)
    ? countIndicatorDora(tiles, context.uraDoraIndicators ?? [])
    : 0;
  const akaDora = rules.akaDora ? (context.akaDoraCount ?? 0) : 0;
  return { dora, akaDora, uraDora };
}

function countIndicatorDora(tiles: readonly TileId[], indicators: readonly TileId[]): number {
  if (indicators.length === 0) {
    return 0;
  }
  const doraTiles = indicators.map(nextDoraTile);
  let count = 0;
  for (const tile of tiles) {
    if (doraTiles.includes(tile)) {
      count += 1;
    }
  }
  return count;
}

function nextDoraTile(indicator: TileId): TileId {
  const suit = indicator[1];
  const rank = Number(indicator[0]);
  if (suit === "z") {
    if (rank >= 1 && rank <= 4) {
      return TILES_34[27 + (rank % 4)];
    }
    return ({ 5: "6z", 6: "7z", 7: "5z" } as Record<number, TileId>)[rank];
  }
  const nextRank = rank === 9 ? 1 : rank + 1;
  return `${nextRank}${suit}` as TileId;
}

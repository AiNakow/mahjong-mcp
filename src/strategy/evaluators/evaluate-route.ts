import type { TileId } from "../../core/tile.ts";
import type { NanikiruContext } from "../nanikiru-context.ts";
import type { NanikiruPolicy } from "../nanikiru-policy.ts";
import type { EvaluationPart } from "./evaluation.ts";

type RouteName =
  | "tanyao"
  | "yakuhai"
  | "chiitoi"
  | "honitsu"
  | "ittsu"
  | "sanshoku"
  | "chanta"
  | "toitoi";

interface RouteStrength {
  route: RouteName;
  strength: number;
  label: string;
}

export function evaluateRouteCoherence(
  beforeDiscard: readonly TileId[],
  afterDiscard: readonly TileId[],
  discard: TileId,
  policy: NanikiruPolicy,
  context: NanikiruContext = {},
): EvaluationPart {
  const before = getRouteStrengths(beforeDiscard, context);
  const after = getRouteStrengths(afterDiscard, context);
  const reasons: EvaluationPart["reasons"] = [];
  let score = 0;

  for (const route of after) {
    const previous = before.find((item) => item.route === route.route)?.strength ?? 0;
    if (route.strength >= 0.75) {
      const routeScore = Math.round(route.strength * policy.routeCommitmentBonus);
      score += routeScore;
      reasons.push({
        type: "route",
        polarity: "positive",
        priority: 72,
        message: `切 ${discard} 后${route.label}路线清晰，后续应按该方向评价进张和改良。`,
        data: {
          discard,
          route: route.route,
          routeStrength: route.strength,
          routeScore,
        },
      });
    }

    const improvement = route.strength - previous;
    if (improvement >= 0.25) {
      const improvementScore = Math.round(improvement * policy.routeImprovementBonus);
      score += improvementScore;
      reasons.push({
        type: "route",
        polarity: "positive",
        priority: 78,
        message: `切 ${discard} 明确强化${route.label}路线，成役方向更稳定。`,
        data: {
          discard,
          route: route.route,
          previousStrength: previous,
          routeStrength: route.strength,
          routeScore: improvementScore,
        },
      });
    }
  }

  for (const route of before) {
    const next = after.find((item) => item.route === route.route)?.strength ?? 0;
    const drop = route.strength - next;
    if (route.route === "yakuhai" && isYakuhaiTile(discard, context) && getTanyaoStrength(afterDiscard, context) >= 0.7) {
      continue;
    }
    if (route.strength >= 0.55 && drop >= 0.25) {
      const penalty = Math.round(drop * policy.routeBreakPenalty);
      score -= penalty;
      reasons.push({
        type: "route",
        polarity: "negative",
        priority: 64,
        message: `切 ${discard} 会削弱原本的${route.label}路线，路线收益需要打折。`,
        data: {
          discard,
          route: route.route,
          previousStrength: route.strength,
          routeStrength: next,
          routePenalty: penalty,
        },
      });
    }
  }

  const tanyaoAfter = after.find((route) => route.route === "tanyao")?.strength ?? 0;
  if (tanyaoAfter >= 0.6 && tanyaoAfter < 1 && isSimpleTile(discard) && hasLooseTerminalOrHonor(afterDiscard)) {
    const penalty = Math.round(policy.routeBreakPenalty * 0.4);
    score -= penalty;
    reasons.push({
      type: "route",
      polarity: "negative",
      priority: 66,
      message: `切 ${discard} 先损失中张却仍留下幺九障碍，断幺路线效率需要打折。`,
      data: {
        discard,
        route: "tanyao",
        routeStrength: tanyaoAfter,
        routePenalty: penalty,
      },
    });
  }

  return { score, reasons };
}

function getRouteStrengths(tiles: readonly TileId[], context: NanikiruContext): RouteStrength[] {
  const strengths: RouteStrength[] = [
    { route: "tanyao", strength: getTanyaoStrength(tiles, context), label: "断幺" },
    { route: "yakuhai", strength: getYakuhaiStrength(tiles, context), label: "役牌" },
    { route: "chiitoi", strength: getChiitoiStrength(tiles), label: "七对子" },
    { route: "honitsu", strength: getHonitsuStrength(tiles), label: "染手" },
    { route: "ittsu", strength: getIttsuStrength(tiles), label: "一气通贯" },
    { route: "sanshoku", strength: getSanshokuStrength(tiles), label: "三色同顺" },
    { route: "chanta", strength: getChantaStrength(tiles), label: "全带" },
    { route: "toitoi", strength: getToitoiStrength(tiles), label: "对对和" },
  ];
  return strengths.filter((route) => route.strength > 0);
}

function getTanyaoStrength(tiles: readonly TileId[], context: NanikiruContext): number {
  if (isOpenHand(context) && context.rules?.kuitan === false) {
    return 0;
  }

  const terminalHonorCount = tiles.filter(isTerminalOrHonor).length;
  if (terminalHonorCount === 0) {
    return 1;
  }
  if (terminalHonorCount <= 2) {
    return getTerminalHonorPairCount(tiles) > 0 ? 0.35 : 0.7;
  }
  return 0;
}

function getYakuhaiStrength(tiles: readonly TileId[], context: NanikiruContext): number {
  const counts = countTileIds(tiles);
  const yakuhaiTiles = new Set<TileId>(["5z", "6z", "7z"]);
  if (context.bakaze) {
    yakuhaiTiles.add(context.bakaze);
  }
  if (context.seatWind) {
    yakuhaiTiles.add(context.seatWind);
  }

  let best = 0;
  for (const tile of yakuhaiTiles) {
    const count = counts.get(tile) ?? 0;
    if (count >= 3) {
      best = Math.max(best, 1);
    } else if (count === 2) {
      best = Math.max(best, 0.8);
    } else if (count === 1) {
      best = Math.max(best, 0.25);
    }
  }
  return best;
}

function getChiitoiStrength(tiles: readonly TileId[]): number {
  const pairCount = countPairs(tiles);
  if (pairCount < 3) {
    return 0;
  }
  return Math.min(1, (pairCount - 2) / 4);
}

function getHonitsuStrength(tiles: readonly TileId[]): number {
  const suits = { m: 0, p: 0, s: 0 };
  let honors = 0;
  for (const tile of tiles) {
    const suit = tile[1];
    if (suit === "m" || suit === "p" || suit === "s") {
      suits[suit] += 1;
    } else {
      honors += 1;
    }
  }

  const bestSuitCount = Math.max(suits.m, suits.p, suits.s);
  const numberCount = suits.m + suits.p + suits.s;
  const offSuitCount = numberCount - bestSuitCount;
  if (bestSuitCount >= 8 && offSuitCount <= 2) {
    return 1;
  }
  if (bestSuitCount >= 7 && offSuitCount <= 3 && honors >= 1) {
    return 0.7;
  }
  if (bestSuitCount >= 6 && offSuitCount <= 3 && honors >= 2) {
    return 0.55;
  }
  return 0;
}

function getIttsuStrength(tiles: readonly TileId[]): number {
  let best = 0;
  for (const suit of ["m", "p", "s"] as const) {
    const raw = [1, 4, 7]
      .map((start) => getSequenceBlockStrength(tiles, suit, start))
      .reduce((total, value) => total + value, 0);
    best = Math.max(best, raw / 6);
  }
  return best >= 0.55 ? Math.min(1, best) : 0;
}

function getSanshokuStrength(tiles: readonly TileId[]): number {
  let best = 0;
  for (let start = 1; start <= 7; start += 1) {
    const raw = (["m", "p", "s"] as const)
      .map((suit) => getSequenceBlockStrength(tiles, suit, start))
      .reduce((total, value) => total + value, 0);
    best = Math.max(best, raw / 6);
  }
  return best >= 0.55 ? Math.min(1, best) : 0;
}

function getChantaStrength(tiles: readonly TileId[]): number {
  if (getTanyaoStrength(tiles, {}) > 0) {
    return 0;
  }

  const terminalHonorCount = tiles.filter(isTerminalOrHonor).length;
  if (terminalHonorCount < 5) {
    return 0;
  }
  return Math.min(1, terminalHonorCount / 8);
}

function getToitoiStrength(tiles: readonly TileId[]): number {
  const counts = countTileIds(tiles);
  const pairCount = [...counts.values()].filter((count) => count >= 2).length;
  const tripletCount = [...counts.values()].filter((count) => count >= 3).length;
  const blockScore = tripletCount * 2 + Math.max(0, pairCount - tripletCount);
  if (blockScore < 3) {
    return 0;
  }
  return Math.min(1, blockScore / 6);
}

function getSequenceBlockStrength(tiles: readonly TileId[], suit: "m" | "p" | "s", start: number): number {
  const needed = [`${start}${suit}`, `${start + 1}${suit}`, `${start + 2}${suit}`] as TileId[];
  const present = needed.filter((tile) => tiles.includes(tile)).length;
  if (present === 3) {
    return 2;
  }
  if (present === 2) {
    return 1;
  }
  return 0;
}

function hasLooseTerminalOrHonor(tiles: readonly TileId[]): boolean {
  const counts = countTileIds(tiles);
  return tiles.some((tile) => isTerminalOrHonor(tile) && (counts.get(tile) ?? 0) === 1);
}

function getTerminalHonorPairCount(tiles: readonly TileId[]): number {
  const counts = countTileIds(tiles);
  return [...counts].filter(([tile, count]) => count >= 2 && isTerminalOrHonor(tile)).length;
}

function countPairs(tiles: readonly TileId[]): number {
  const counts = countTileIds(tiles);
  return [...counts.values()].filter((count) => count >= 2).length;
}

function countTileIds(tiles: readonly TileId[]): Map<TileId, number> {
  const counts = new Map<TileId, number>();
  for (const tile of tiles) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  return counts;
}

function isSimpleTile(tile: TileId): boolean {
  const suit = tile[1];
  const rank = Number(tile[0]);
  return suit !== "z" && rank >= 2 && rank <= 8;
}

function isYakuhaiTile(tile: TileId, context: NanikiruContext): boolean {
  if (tile === "5z" || tile === "6z" || tile === "7z") {
    return true;
  }
  return tile === context.bakaze || tile === context.seatWind;
}

function isTerminalOrHonor(tile: TileId): boolean {
  const suit = tile[1];
  const rank = Number(tile[0]);
  return suit === "z" || rank === 1 || rank === 9;
}

function isOpenHand(context: NanikiruContext): boolean {
  return (context.calls ?? []).some((call) => call.type !== "ankan");
}

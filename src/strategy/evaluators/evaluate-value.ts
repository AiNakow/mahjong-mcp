import type { TileId } from "../../core/tile.ts";
import type { NanikiruPolicy } from "../nanikiru-policy.ts";
import type { EvaluationPart } from "./evaluation.ts";

export type ValueRoute = "yakuhai" | "tanyao" | "chiitoi" | "honitsu";

interface ValueRouteScore {
  route: ValueRoute;
  score: number;
  reasons: EvaluationPart["reasons"];
  data?: Record<string, unknown>;
}

export function evaluateValuePotential(
  afterDiscard: readonly TileId[],
  discard: TileId,
  policy: NanikiruPolicy,
): EvaluationPart {
  const routeScores = [
    evaluateYakuhaiRoute(afterDiscard, discard, policy),
    evaluateTanyaoRoute(afterDiscard, discard, policy),
    evaluateChiitoiRoute(afterDiscard, discard, policy),
    evaluateHonitsuRoute(afterDiscard, discard, policy),
  ].filter((route) => route.score > 0)
    .sort((a, b) => b.score - a.score);

  const primary = routeScores[0];
  const secondary = routeScores[1];
  if (!primary) {
    return { score: 0, reasons: [] };
  }

  const score = primary.score + (secondary?.score ?? 0) * policy.secondaryValueRouteRatio;
  const reasons = [
    ...primary.reasons,
    ...(secondary ? secondary.reasons.map((reason) => ({
      ...reason,
      priority: Math.max(1, reason.priority - 18),
      data: {
        ...reason.data,
        secondaryRoute: true,
        appliedRatio: policy.secondaryValueRouteRatio,
      },
    })) : []),
  ];

  reasons.push({
    type: "value",
    polarity: "neutral",
    priority: 42,
    message: secondary
      ? `打点潜力以${formatRoute(primary.route)}为主，${formatRoute(secondary.route)}作为次要路线折算。`
      : `打点潜力以${formatRoute(primary.route)}为主。`,
    data: {
      primaryRoute: primary.route,
      primaryScore: primary.score,
      secondaryRoute: secondary?.route,
      secondaryScore: secondary?.score,
      secondaryRatio: policy.secondaryValueRouteRatio,
      valueScore: score,
    },
  });

  return { score, reasons };
}

function evaluateYakuhaiRoute(
  afterDiscard: readonly TileId[],
  discard: TileId,
  policy: NanikiruPolicy,
): ValueRouteScore {
  const yakuhaiPairs = getYakuhaiPairs(afterDiscard);
  if (yakuhaiPairs.length === 0) {
    return { route: "yakuhai", score: 0, reasons: [] };
  }

  const tanyaoStrength = getTanyaoStrength(afterDiscard);
  const decay = 1 - tanyaoStrength * policy.yakuhaiTanyaoConflictDecay;
  const score = Math.round(policy.yakuhaiPairBonus * decay);

  return {
    route: "yakuhai",
    score,
    reasons: [
      {
      type: "value",
      polarity: "positive",
      priority: 70,
      message: tanyaoStrength >= 0.7
        ? `保留役牌对子 ${yakuhaiPairs.join("、")}，但手牌也接近断幺，役牌价值已折减。`
        : `保留役牌对子 ${yakuhaiPairs.join("、")}，有直接成役价值。`,
      data: { discard, yakuhaiPairs, tanyaoStrength, decay },
      },
    ],
  };
}

function evaluateTanyaoRoute(
  afterDiscard: readonly TileId[],
  discard: TileId,
  policy: NanikiruPolicy,
): ValueRouteScore {
  const tanyaoStrength = getTanyaoStrength(afterDiscard);
  if (tanyaoStrength <= 0) {
    return { route: "tanyao", score: 0, reasons: [] };
  }

  const breakingYakuhaiPair = isBreakingYakuhaiPairForTanyao(afterDiscard, discard);
  const score = Math.round(policy.tanyaoLeanBonus * tanyaoStrength)
    + (breakingYakuhaiPair ? policy.breakYakuhaiPairForTanyaoBonus : 0);
  return {
    route: "tanyao",
    score,
    reasons: [
      {
      type: "value",
      polarity: "positive",
      priority: breakingYakuhaiPair ? 88 : 62,
      message: tanyaoStrength >= 1
        ? "手牌已接近完全断幺形，后续打点和副露灵活性较好。"
        : breakingYakuhaiPair
          ? "拆役牌对子后，手牌更接近断幺路线，延展性和副露空间更好。"
          : "手牌偏断幺，后续打点和副露灵活性较好。",
      data: {
        discard,
        tanyaoStrength,
        breakingYakuhaiPair,
        breakYakuhaiPairForTanyaoBonus: breakingYakuhaiPair
          ? policy.breakYakuhaiPairForTanyaoBonus
          : 0,
      },
      },
    ],
  };
}

function evaluateChiitoiRoute(
  afterDiscard: readonly TileId[],
  discard: TileId,
  policy: NanikiruPolicy,
): ValueRouteScore {
  const pairCount = countPairs(afterDiscard);
  if (pairCount < policy.chiitoiPairThreshold) {
    return { route: "chiitoi", score: 0, reasons: [] };
  }

  return {
    route: "chiitoi",
    score: policy.chiitoiBonus,
    reasons: [
      {
      type: "value",
      polarity: "positive",
      priority: 58,
      message: `对子达到 ${pairCount} 对，保留七对子路线。`,
      data: { discard, pairCount },
      },
    ],
  };
}

function evaluateHonitsuRoute(
  afterDiscard: readonly TileId[],
  discard: TileId,
  policy: NanikiruPolicy,
): ValueRouteScore {
  const honitsuSuit = getHonitsuLeanSuit(afterDiscard, policy.honitsuSuitThreshold);
  if (!honitsuSuit) {
    return { route: "honitsu", score: 0, reasons: [] };
  }

  return {
    route: "honitsu",
    score: policy.honitsuBonus,
    reasons: [
      {
      type: "value",
      polarity: "positive",
      priority: 56,
      message: `${formatSuit(honitsuSuit)}数量较集中，有染手潜力。`,
      data: { discard, suit: honitsuSuit },
      },
    ],
  };
}

function countPairs(tiles: readonly TileId[]): number {
  const counts = countTileIds(tiles);
  return [...counts.values()].filter((count) => count >= 2).length;
}

function getYakuhaiPairs(tiles: readonly TileId[]): TileId[] {
  const counts = countTileIds(tiles);
  return (["5z", "6z", "7z"] as const).filter((tile) => (counts.get(tile) ?? 0) >= 2);
}

function getTanyaoStrength(tiles: readonly TileId[]): number {
  const terminalHonorCount = tiles.filter(isTerminalOrHonor).length;
  if (terminalHonorCount === 0) {
    return 1;
  }
  if (terminalHonorCount <= 2) {
    const terminalHonorPairs = getTerminalHonorPairCount(tiles);
    return terminalHonorPairs > 0 ? 0.35 : 0.7;
  }
  return 0;
}

function getTerminalHonorPairCount(tiles: readonly TileId[]): number {
  const counts = countTileIds(tiles);
  let pairs = 0;
  for (const [tile, count] of counts) {
    if (count >= 2 && isTerminalOrHonor(tile)) {
      pairs += 1;
    }
  }
  return pairs;
}

function isBreakingYakuhaiPairForTanyao(afterDiscard: readonly TileId[], discard: TileId): boolean {
  if (discard !== "5z" && discard !== "6z" && discard !== "7z") {
    return false;
  }

  const counts = countTileIds(afterDiscard);
  return (counts.get(discard) ?? 0) === 1 && getTanyaoStrength(afterDiscard) >= 0.7;
}

function getHonitsuLeanSuit(tiles: readonly TileId[], threshold: number): "m" | "p" | "s" | undefined {
  const suits = {
    m: 0,
    p: 0,
    s: 0,
  };
  let numberTileCount = 0;

  for (const tile of tiles) {
    const suit = tile[1];
    if (suit === "m" || suit === "p" || suit === "s") {
      suits[suit] += 1;
      numberTileCount += 1;
    }
  }

  for (const suit of ["m", "p", "s"] as const) {
    const offSuitCount = numberTileCount - suits[suit];
    if (suits[suit] >= threshold && offSuitCount <= 2) {
      return suit;
    }
  }

  return undefined;
}

function countTileIds(tiles: readonly TileId[]): Map<TileId, number> {
  const counts = new Map<TileId, number>();
  for (const tile of tiles) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  return counts;
}

function isTerminalOrHonor(tile: TileId): boolean {
  return tile[1] === "z" || tile[0] === "1" || tile[0] === "9";
}

function formatSuit(suit: "m" | "p" | "s"): string {
  if (suit === "m") {
    return "万子";
  }
  if (suit === "p") {
    return "饼子";
  }
  return "索子";
}

function formatRoute(route: ValueRoute): string {
  if (route === "yakuhai") {
    return "役牌路线";
  }
  if (route === "tanyao") {
    return "断幺路线";
  }
  if (route === "chiitoi") {
    return "七对子路线";
  }
  return "染手路线";
}

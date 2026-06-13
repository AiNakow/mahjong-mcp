import type { TileId } from "../../core/tile.ts";
import type { CandidateFeature } from "../features.ts";
import { isTerminalOrHonor } from "../features.ts";
import type { NanikiruPolicy } from "../nanikiru-policy.ts";
import type { NanikiruContext } from "../nanikiru-context.ts";
import type { EvaluationPart } from "./evaluation.ts";
import {
  evaluateRoutePortfolio,
  type RouteEvaluation,
  type RouteId,
  type RoutePortfolio,
} from "../routes.ts";

interface RouteStrength {
  route: RouteId;
  strength: number;
  label: string;
}

export function evaluateRouteCoherence(
  beforeFeature: CandidateFeature,
  afterFeature: CandidateFeature,
  policy: NanikiruPolicy,
  context: NanikiruContext = {},
  portfolios: {
    before?: RoutePortfolio;
    after?: RoutePortfolio;
  } = {},
): EvaluationPart {
  const beforePortfolio = portfolios.before ?? evaluateRoutePortfolio(beforeFeature, policy, context);
  const afterPortfolio = portfolios.after ?? evaluateRoutePortfolio(afterFeature, policy, context);
  const before = getRouteStrengths(beforePortfolio);
  const after = getRouteStrengths(afterPortfolio);
  const reasons: EvaluationPart["reasons"] = [];
  let score = 0;

  for (const route of after) {
    const previous = before.find((item) => item.route === route.route)?.strength ?? 0;
    if (afterFeature.shanten > 0 && route.strength >= 0.75) {
      const routeScore = Math.round(route.strength * policy.routeCommitmentBonus);
      score += routeScore;
      reasons.push({
        type: "route",
        polarity: "positive",
        priority: 72,
        message: `切 ${afterFeature.discard} 后${route.label}路线清晰，后续应按该方向评价进张和改良。`,
        data: {
          discard: afterFeature.discard,
          route: route.route,
          routeStrength: route.strength,
          routeScore,
        },
      });
    }

    const improvement = route.strength - previous;
    if (
      afterFeature.shanten > 0
      &&
      improvement >= 0.25
      && !isWeakTanyaoAroundDoraYakuhaiPair(route, afterPortfolio)
    ) {
      const improvementScore = Math.round(improvement * policy.routeImprovementBonus);
      score += improvementScore;
      reasons.push({
        type: "route",
        polarity: "positive",
        priority: 78,
        message: `切 ${afterFeature.discard} 明确强化${route.label}路线，成役方向更稳定。`,
        data: {
          discard: afterFeature.discard,
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
    if (
      route.route === "yakuhai"
      && isYakuhaiTile(afterFeature.discard, context)
      && getPortfolioRouteStrength(afterPortfolio, "tanyao") >= 0.7
    ) {
      continue;
    }
    if (route.strength >= 0.55 && drop >= 0.25) {
      const penaltyMultiplier = getRouteBreakPenaltyMultiplier(route.route, afterFeature, afterPortfolio);
      const penalty = Math.round(drop * policy.routeBreakPenalty * penaltyMultiplier);
      score -= penalty;
      reasons.push({
        type: "route",
        polarity: "negative",
        priority: 64,
        message: `切 ${afterFeature.discard} 会削弱原本的${route.label}路线，路线收益需要打折。`,
        data: {
          discard: afterFeature.discard,
          route: route.route,
          previousStrength: route.strength,
          routeStrength: next,
          routePenalty: penalty,
          penaltyMultiplier,
        },
      });
    }
  }

  const tanyaoAfter = getPortfolioRouteStrength(afterPortfolio, "tanyao");
  if (
    tanyaoAfter >= 0.6
    && tanyaoAfter < 1
    && isSimpleTile(afterFeature.discard)
    && hasLooseTerminalOrHonor(afterFeature)
  ) {
    const penalty = Math.round(policy.routeBreakPenalty * 0.4);
    score -= penalty;
    reasons.push({
      type: "route",
      polarity: "negative",
      priority: 66,
      message: `切 ${afterFeature.discard} 先损失断幺牌却仍留下幺九障碍，断幺路线效率需要打折。`,
      data: {
        discard: afterFeature.discard,
        route: "tanyao",
        routeStrength: tanyaoAfter,
        routePenalty: penalty,
      },
    });
  }

  return { score, reasons };
}

function getRouteStrengths(portfolio: RoutePortfolio): RouteStrength[] {
  return portfolio.routes
    .filter((route) => route.id !== "dora")
    .map((route) => ({
      route: route.id,
      strength: route.strength,
      label: formatRoute(route.id),
    }));
}

function getPortfolioRouteStrength(portfolio: RoutePortfolio, id: RouteId): number {
  return portfolio.routes.find((route) => route.id === id)?.strength ?? 0;
}

function isWeakTanyaoAroundDoraYakuhaiPair(route: RouteStrength, portfolio: RoutePortfolio): boolean {
  if (route.route !== "tanyao" || route.strength >= 0.7) {
    return false;
  }
  return portfolio.routes.some((item) => (
    item.id === "yakuhai"
    && item.synergyTags.includes("dora")
  ));
}

function getRouteBreakPenaltyMultiplier(
  route: RouteId,
  afterFeature: CandidateFeature,
  afterPortfolio: RoutePortfolio,
): number {
  if (route === "toitoi" && hasDoraYakuhaiPairRoute(afterPortfolio)) {
    return 0;
  }
  if (
    route === "ittsu"
    && isTerminalNumberTile(afterFeature.discard)
    && getTanyaoStrengthFromFeature(afterFeature) >= 0.7
  ) {
    return 0.4;
  }
  return 1;
}

function hasDoraYakuhaiPairRoute(portfolio: RoutePortfolio): boolean {
  return portfolio.routes.some((route) => (
    route.id === "yakuhai"
    && route.synergyTags.includes("dora")
  ));
}

function getTanyaoStrengthFromFeature(feature: CandidateFeature): number {
  if (feature.tiles.terminalHonorCount === 0) {
    return 1;
  }
  if (feature.tiles.terminalHonorCount <= 2) {
    const terminalHonorPairs = [...feature.counts]
      .filter(([tile, count]) => count >= 2 && isTerminalOrHonor(tile))
      .length;
    return terminalHonorPairs > 0 ? 0.35 : 0.7;
  }
  return 0;
}

function hasLooseTerminalOrHonor(feature: CandidateFeature): boolean {
  return feature.afterDiscard.some((tile) => (
    isTerminalOrHonor(tile)
    && (feature.counts.get(tile) ?? 0) === 1
  ));
}

function isSimpleTile(tile: TileId): boolean {
  const suit = tile[1];
  const rank = Number(tile[0]);
  return suit !== "z" && rank >= 2 && rank <= 8;
}

function isTerminalNumberTile(tile: TileId): boolean {
  const rank = Number(tile[0]);
  return tile[1] !== "z" && (rank === 1 || rank === 9);
}

function isYakuhaiTile(tile: TileId, context: NanikiruContext): boolean {
  if (tile === "5z" || tile === "6z" || tile === "7z") {
    return true;
  }
  return tile === context.bakaze || tile === context.seatWind;
}

function formatRoute(route: RouteId): string {
  if (route === "yakuhai") {
    return "役牌";
  }
  if (route === "tanyao") {
    return "断幺";
  }
  if (route === "chiitoi") {
    return "七对子";
  }
  if (route === "honitsu") {
    return "染手";
  }
  if (route === "ittsu") {
    return "一气通贯";
  }
  if (route === "sanshoku") {
    return "三色同顺";
  }
  if (route === "chanta_sanshoku") {
    return "全带三色";
  }
  if (route === "chanta") {
    return "全带";
  }
  if (route === "toitoi") {
    return "对对和";
  }
  return "宝牌";
}

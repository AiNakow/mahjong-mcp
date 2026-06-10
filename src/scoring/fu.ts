import type { AgariContext, AgariDecomposition, MeldShape } from "./types.ts";
import { isMenzen, isValuePair } from "./yaku.ts";

export function calculateFu(context: AgariContext, decomposition: AgariDecomposition): number {
  if (decomposition.kind === "kokushi") {
    return 0;
  }
  if (decomposition.kind === "chiitoi") {
    return 25;
  }

  const menzen = isMenzen(context);
  const pinfu = isPinfuShape(context, decomposition, menzen);
  if (pinfu && context.method === "tsumo") {
    return 20;
  }
  if (pinfu && context.method === "ron") {
    return 30;
  }

  let fu = 20;
  if (menzen && context.method === "ron") {
    fu += 10;
  }
  if (context.method === "tsumo") {
    fu += 2;
  }
  if (decomposition.pair) {
    fu += pairFu(context, decomposition.pair);
  }
  for (let i = 0; i < decomposition.melds.length; i += 1) {
    fu += meldFu(context, decomposition.melds[i], decomposition, i);
  }
  if (decomposition.wait === "tanki" || decomposition.wait === "kanchan" || decomposition.wait === "penchan") {
    fu += 2;
  }

  if (fu === 20 && context.method === "ron") {
    fu = 30;
  }
  return roundUpTo10(fu);
}

function isPinfuShape(context: AgariContext, decomposition: AgariDecomposition, menzen: boolean): boolean {
  return menzen
    && decomposition.kind === "standard"
    && decomposition.wait === "ryanmen"
    && decomposition.melds.every((meld) => meld.kind === "sequence")
    && !!decomposition.pair
    && !isValuePair(decomposition.pair, context);
}

function pairFu(context: AgariContext, pair: string): number {
  let fu = 0;
  if (pair === "5z" || pair === "6z" || pair === "7z") {
    fu += 2;
  }
  if (pair === context.bakaze) {
    fu += 2;
  }
  if (pair === context.seatWind) {
    fu += 2;
  }
  return fu;
}

function meldFu(
  context: AgariContext,
  meld: MeldShape,
  decomposition: AgariDecomposition,
  meldIndex: number,
): number {
  if (meld.kind === "sequence") {
    return 0;
  }

  const terminalOrHonor = meld.tiles[0][1] === "z" || meld.tiles[0][0] === "1" || meld.tiles[0][0] === "9";
  const concealed = isConcealedForFu(context, meld, decomposition, meldIndex);
  const base = meld.kind === "quad" ? 8 : 2;
  return base * (terminalOrHonor ? 2 : 1) * (concealed ? 2 : 1);
}

function isConcealedForFu(
  context: AgariContext,
  meld: MeldShape,
  decomposition: AgariDecomposition,
  meldIndex: number,
): boolean {
  if (meld.source === "ankan") {
    return true;
  }
  if (meld.source === "open") {
    return false;
  }
  if (
    context.method === "ron"
    && decomposition.wait === "shanpon"
    && decomposition.winningMeldIndex === meldIndex
    && meld.kind === "triplet"
  ) {
    return false;
  }
  return true;
}

function roundUpTo10(value: number): number {
  return Math.ceil(value / 10) * 10;
}

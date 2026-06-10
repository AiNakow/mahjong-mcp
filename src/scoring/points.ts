import type { AgariContext, PointResult } from "./types.ts";

export function calculatePoints(context: AgariContext, han: number, fu: number, yakuman = 0): PointResult {
  const dealer = context.seatWind === "1z";
  const honba = context.honba ?? 0;
  const riichiSticks = context.riichiSticks ?? 0;

  if (yakuman > 0) {
    return paymentFromBase(context, 8000 * yakuman, dealer, "yakuman", honba, riichiSticks);
  }

  const limit = limitBasePoints(han, fu);
  if (limit) {
    return paymentFromBase(context, limit.basePoints, dealer, limit.name, honba, riichiSticks);
  }

  const basePoints = fu * (2 ** (han + 2));
  return paymentFromBase(context, basePoints, dealer, undefined, honba, riichiSticks);
}

function limitBasePoints(
  han: number,
  fu: number,
): { basePoints: number; name: NonNullable<PointResult["limit"]> } | undefined {
  const basePoints = fu * (2 ** (han + 2));
  if (han >= 13) {
    return { basePoints: 8000, name: "yakuman" };
  }
  if (han >= 11) {
    return { basePoints: 6000, name: "sanbaiman" };
  }
  if (han >= 8) {
    return { basePoints: 4000, name: "baiman" };
  }
  if (han >= 6) {
    return { basePoints: 3000, name: "haneman" };
  }
  if (han >= 5 || basePoints >= 2000) {
    return { basePoints: 2000, name: "mangan" };
  }
  return undefined;
}

function paymentFromBase(
  context: AgariContext,
  basePoints: number,
  dealer: boolean,
  limit: PointResult["limit"],
  honba: number,
  riichiSticks: number,
): PointResult {
  if (context.method === "ron") {
    const ron = roundUp100(basePoints * (dealer ? 6 : 4)) + honba * 300;
    return {
      basePoints,
      limit,
      total: ron + riichiSticks * 1000,
      ron,
    };
  }

  if (dealer) {
    const payment = roundUp100(basePoints * 2) + honba * 100;
    return {
      basePoints,
      limit,
      total: payment * 3 + riichiSticks * 1000,
      tsumo: {
        dealer: payment,
        nonDealer: payment,
      },
    };
  }

  const dealerPayment = roundUp100(basePoints * 2) + honba * 100;
  const nonDealerPayment = roundUp100(basePoints) + honba * 100;
  return {
    basePoints,
    limit,
    total: dealerPayment + nonDealerPayment * 2 + riichiSticks * 1000,
    tsumo: {
      dealer: dealerPayment,
      nonDealer: nonDealerPayment,
    },
  };
}

function roundUp100(value: number): number {
  return Math.ceil(value / 100) * 100;
}

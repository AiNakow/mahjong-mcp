import type { GameState } from "../core/state.ts";
import type { WindTile } from "../core/tile.ts";
import type { Reason } from "./reason.ts";

export type PlacementMode = "attack" | "balance" | "defense" | "push";
export type AvoidFourthGoal = "none" | "winOut" | "tenpaiKeep" | "fold" | "chase";

export interface PlacementContext {
  selfRank: number;
  pointDiffToNext: number;
  pointDiffToFirst: number;
  pointDiffToFourth: number;
  turn: number;
  isSouthRound: boolean;
  isFinalRound: boolean;
  isFinalOrNearFinal: boolean;
  selfIsDealer: boolean;
  dealerThreat: boolean;
  leadOverFourth: number;
  fourthThreatening: boolean;
}

export interface PlacementInput {
  shanten: number;
  highValueHand: boolean;
}

export interface PlacementAdjustment {
  context: PlacementContext;
  pushBias: number;
  defenseWeightMul: number;
  valueWeightMul: number;
  shantenWeightMul: number;
  ukeireWeightMul: number;
  avoidFourthGoal: AvoidFourthGoal;
  reasons: Reason[];
}

export function evaluatePlacementAdjustment(
  state: GameState,
  input: PlacementInput = { shanten: 2, highValueHand: false },
): PlacementAdjustment {
  const context = buildPlacementContext(state);
  const reasons: Reason[] = [];
  let pushBias = 0;
  let defenseWeightMul = 1;
  let valueWeightMul = 1;
  let shantenWeightMul = 1;
  let ukeireWeightMul = 1;
  let avoidFourthGoal: AvoidFourthGoal = "none";

  if (context.isSouthRound && context.selfRank === 1 && context.pointDiffToNext >= 12000) {
    defenseWeightMul *= 1.4;
    pushBias -= 2;
    reasons.push({
      type: "placement",
      polarity: "positive",
      priority: 82,
      message: "南场领先较多，当前优先降低放铳风险。",
      data: { selfRank: context.selfRank, pointDiffToNext: context.pointDiffToNext },
    });
  }

  if (context.isFinalOrNearFinal && context.selfRank === 1) {
    defenseWeightMul *= 1.8;
    pushBias -= 4;
    reasons.push({
      type: "placement",
      polarity: "positive",
      priority: 90,
      message: "终局附近处于领先，防守权重明显提高。",
      data: { selfRank: context.selfRank, pointDiffToNext: context.pointDiffToNext },
    });
  }

  if (context.isSouthRound && context.selfRank >= 3 && context.pointDiffToFirst >= 12000) {
    valueWeightMul *= 1.25;
    pushBias += 2;
    reasons.push({
      type: "placement",
      polarity: "positive",
      priority: 84,
      message: "南场落后较多，需要保留高打点推进路线。",
      data: { selfRank: context.selfRank, pointDiffToFirst: context.pointDiffToFirst },
    });
  }

  if (context.selfIsDealer) {
    valueWeightMul *= 1.1;
    pushBias += 1;
    reasons.push({
      type: "placement",
      polarity: "positive",
      priority: 66,
      message: "自家亲家，推进连庄收益略高。",
      data: { selfRank: context.selfRank },
    });
  }

  if (context.dealerThreat) {
    defenseWeightMul *= 1.25;
    pushBias -= 1;
    reasons.push({
      type: "placement",
      polarity: "positive",
      priority: 78,
      message: "威胁者是亲家，放铳损失更高。",
      data: { selfRank: context.selfRank },
    });
  }

  if (state.round.riichiSticks > 0 || state.round.honba >= 2) {
    valueWeightMul *= 1.05;
    if (state.round.riichiSticks >= 2 || state.round.honba >= 3) {
      pushBias += 1;
    }
    reasons.push({
      type: "placement",
      polarity: "positive",
      priority: 54,
      message: "场上供托或本场增加，推进收益小幅上升。",
      data: { honba: state.round.honba, riichiSticks: state.round.riichiSticks },
    });
  }

  avoidFourthGoal = chooseAvoidFourthGoal(context, input);
  if (avoidFourthGoal === "winOut") {
    pushBias += 2;
    ukeireWeightMul *= 1.2;
    defenseWeightMul *= 1.1;
    valueWeightMul *= 0.9;
    reasons.push({
      type: "placement",
      polarity: "positive",
      priority: 92,
      message: "南四与四位微差，当前听牌，和牌结束是主要避四路线。",
      data: {
        selfRank: context.selfRank,
        leadOverFourth: context.leadOverFourth,
        shanten: input.shanten,
        avoidFourthGoal,
      },
    });
  } else if (avoidFourthGoal === "tenpaiKeep") {
    shantenWeightMul *= 1.2;
    ukeireWeightMul *= 1.15;
    defenseWeightMul *= 1.15;
    valueWeightMul *= 0.8;
    if (context.leadOverFourth <= 1000) {
      shantenWeightMul *= 1.1;
      ukeireWeightMul *= 1.05;
    }
    reasons.push({
      type: "placement",
      polarity: "positive",
      priority: 91,
      message: "南四与四位微差，流局听牌也能避免罚符逆转，当前优先保听和速度。",
      data: {
        selfRank: context.selfRank,
        leadOverFourth: context.leadOverFourth,
        shanten: input.shanten,
        avoidFourthGoal,
      },
    });
  } else if (avoidFourthGoal === "fold") {
    defenseWeightMul *= 1.45;
    pushBias -= 2;
    valueWeightMul *= 0.85;
    if (context.fourthThreatening) {
      defenseWeightMul *= 1.25;
      pushBias -= 1;
    }
    reasons.push({
      type: "placement",
      polarity: "positive",
      priority: 93,
      message: "南四手牌较慢且四位正在进攻，当前优先避免放铳落四。",
      data: {
        selfRank: context.selfRank,
        leadOverFourth: context.leadOverFourth,
        shanten: input.shanten,
        fourthThreatening: context.fourthThreatening,
        avoidFourthGoal,
      },
    });
  } else if (avoidFourthGoal === "chase") {
    pushBias += 2;
    valueWeightMul *= 1.25;
    ukeireWeightMul *= 1.05;
    reasons.push({
      type: "placement",
      polarity: "positive",
      priority: 89,
      message: "当前四位，需要保留脱四所需打点推进。",
      data: {
        selfRank: context.selfRank,
        pointDiffToNext: context.pointDiffToNext,
        shanten: input.shanten,
        highValueHand: input.highValueHand,
        avoidFourthGoal,
      },
    });
  }

  return {
    context,
    pushBias,
    defenseWeightMul,
    valueWeightMul,
    shantenWeightMul,
    ukeireWeightMul,
    avoidFourthGoal,
    reasons,
  };
}

export function adjustModeByPlacement(mode: PlacementMode, adjustment: PlacementAdjustment): PlacementMode {
  if (adjustment.avoidFourthGoal === "winOut") {
    return mode === "balance" || mode === "attack" ? "push" : mode;
  }
  if (adjustment.avoidFourthGoal === "tenpaiKeep") {
    return mode === "balance" && adjustment.pushBias >= 2 ? "push" : mode;
  }
  if (adjustment.avoidFourthGoal === "fold") {
    if (mode === "balance" || mode === "attack") {
      return "defense";
    }
    return mode === "push" ? "balance" : mode;
  }
  if (adjustment.avoidFourthGoal === "chase") {
    return mode === "balance" || mode === "attack" ? "push" : mode;
  }
  if (mode === "balance" && adjustment.pushBias >= 2) {
    return "push";
  }
  if (mode === "push" && adjustment.pushBias <= -3) {
    return "balance";
  }
  if (adjustment.context.turn <= 6) {
    return mode;
  }
  if (mode === "balance" && adjustment.pushBias <= -2) {
    return "defense";
  }
  return mode;
}

function buildPlacementContext(state: GameState): PlacementContext {
  const standings = [
    { seatWind: state.self.seatWind, points: state.self.points, self: true },
    ...state.opponents.map((opponent) => ({
      seatWind: opponent.seatWind,
      points: opponent.points,
      self: false,
    })),
  ].sort((a, b) => b.points - a.points);
  const selfIndex = standings.findIndex((player) => player.self);
  const selfPoints = state.self.points;
  const firstPoints = standings[0]?.points ?? selfPoints;
  const fourthPoints = standings[standings.length - 1]?.points ?? selfPoints;
  const nextPoints = selfIndex > 0
    ? standings[selfIndex - 1]?.points ?? selfPoints
    : standings[1]?.points ?? selfPoints;

  const fourthPlayer = standings[standings.length - 1];
  const fourthThreatening = !fourthPlayer?.self && state.opponents.some((opponent) => (
    opponent.seatWind === fourthPlayer?.seatWind
    && (opponent.riichi === true || opponent.calls.length >= 2)
  ));

  return {
    selfRank: selfIndex >= 0 ? selfIndex + 1 : 1,
    pointDiffToNext: Math.abs(selfPoints - nextPoints),
    pointDiffToFirst: Math.max(0, firstPoints - selfPoints),
    pointDiffToFourth: Math.max(0, selfPoints - fourthPoints),
    turn: state.round.turn,
    isSouthRound: state.round.bakaze === "2z",
    isFinalRound: isFinalRound(state.round.bakaze, state.round.kyoku),
    isFinalOrNearFinal: isFinalOrNearFinal(state.round.bakaze, state.round.kyoku),
    selfIsDealer: state.self.seatWind === "1z",
    dealerThreat: state.opponents.some((opponent) => (
      opponent.seatWind === "1z"
      && (opponent.riichi === true || opponent.calls.length >= 2)
    )),
    leadOverFourth: Math.max(0, selfPoints - fourthPoints),
    fourthThreatening,
  };
}

function chooseAvoidFourthGoal(context: PlacementContext, input: PlacementInput): AvoidFourthGoal {
  if (context.selfRank === 4) {
    return "chase";
  }

  if (context.isFinalRound && context.selfRank === 3 && context.leadOverFourth <= 4000) {
    if (input.shanten === 0) {
      return "winOut";
    }
    if (input.shanten === 1) {
      return "tenpaiKeep";
    }
    if (context.turn <= 6) {
      return "none";
    }
    if (context.turn <= 11) {
      return "tenpaiKeep";
    }
    return context.fourthThreatening ? "fold" : "tenpaiKeep";
  }

  if (context.isFinalOrNearFinal && context.selfRank === 3 && context.leadOverFourth <= 8000) {
    if (input.shanten <= 1) {
      return "tenpaiKeep";
    }
    if (context.fourthThreatening && context.turn >= 8) {
      return "fold";
    }
  }

  return "none";
}

function isFinalRound(bakaze: WindTile, kyoku: number): boolean {
  return bakaze === "2z" && kyoku === 4;
}

function isFinalOrNearFinal(bakaze: WindTile, kyoku: number): boolean {
  return bakaze === "2z" && kyoku >= 3;
}

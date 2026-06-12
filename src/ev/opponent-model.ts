import type { GameState, PlayerState } from "../core/state.ts";
import type { OpponentEstimate } from "./types.ts";

export function estimateOpponentsFast(state: GameState): OpponentEstimate[] {
  return state.opponents.map((opponent) => estimateOpponentFast(state, opponent));
}

function estimateOpponentFast(state: GameState, opponent: PlayerState): OpponentEstimate {
  const calls = opponent.calls.length;
  const turn = state.round.turn;
  let tenpaiRate = Math.min(0.88, 0.10 + turn * 0.035 + calls * 0.13);
  if (opponent.riichi) {
    tenpaiRate = 1;
  }
  const winRate = opponent.riichi
    ? 0.16 + Math.max(0, 14 - turn) * 0.008
    : tenpaiRate * (calls >= 2 ? 0.10 : 0.065);
  const isDealer = opponent.seatWind === "1z";
  const expectedRonValue = (isDealer ? 5800 : 3900) * (calls >= 2 ? 1.08 : 1);
  const expectedTsumoLossToActor = isDealer ? 4000 : 2300;

  return {
    tenpaiRate,
    winRate,
    tsumoRate: winRate * 0.42,
    ronRateAgainstActor: winRate * 0.38,
    expectedRonValue,
    expectedTsumoLossToActor,
    pushAgainstRiichiRate: calls >= 2 || opponent.riichi ? 0.72 : 0.38,
  };
}

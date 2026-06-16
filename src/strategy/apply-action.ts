import type { Call, CallFrom, GameState } from "../core/state.ts";
import type { TileId } from "../core/tile.ts";
import { calculateAgariScore } from "../scoring/index.ts";
import type { DecisionAction } from "./action-types.ts";
import { getPostCallForbiddenDiscards } from "./call-constraints.ts";

export interface AppliedDecisionAction {
  state: GameState;
  terminal: boolean;
}

export function advanceToSelfDraw(state: GameState, drawnTile: TileId): GameState {
  return {
    ...state,
    phase: "self_draw",
    forbiddenDiscards: undefined,
    temporaryFuriten: undefined,
    lastDraw: drawnTile,
    lastDiscard: undefined,
    lastKan: undefined,
  };
}

export function advanceToRinshanDraw(state: GameState, drawnTile: TileId): GameState {
  return {
    ...advanceToSelfDraw(state, drawnTile),
    phase: "rinshan_draw",
    lastKan: state.lastKan?.playerIndex === 0 ? state.lastKan : { type: "ankan", tile: drawnTile, playerIndex: 0 },
  };
}

export function advanceToChankan(state: GameState, kan: { type: "kakan"; tile: TileId; playerIndex: number }): GameState {
  return {
    ...state,
    phase: "chankan",
    forbiddenDiscards: undefined,
    lastDraw: undefined,
    lastDiscard: undefined,
    lastKan: kan,
  };
}

export function applyDecisionAction(state: GameState, action: DecisionAction): AppliedDecisionAction {
  if (action.type === "tsumo" || action.type === "ron") {
    return { state: { ...state, phase: undefined, forbiddenDiscards: undefined, lastKan: undefined }, terminal: true };
  }
  if (action.type === "pass") {
    const passedWinningDiscard = canRonCurrentDiscard(state);
    return {
      state: {
        ...state,
        phase: undefined,
        forbiddenDiscards: undefined,
        temporaryFuriten: state.self.riichi ? state.temporaryFuriten : passedWinningDiscard || state.temporaryFuriten,
        riichiFuriten: state.self.riichi ? passedWinningDiscard || state.riichiFuriten : state.riichiFuriten,
        lastDiscard: undefined,
        lastKan: undefined,
      },
      terminal: false,
    };
  }
  if (action.type === "discard") {
    return applyDiscardAction(state, action.tile, false);
  }
  if (action.type === "riichi") {
    return applyDiscardAction(state, action.tile, true);
  }
  if (action.type === "chi" || action.type === "pon") {
    return applyCallAction(state, action);
  }
  return applyKanAction(state, action);
}

function applyDiscardAction(state: GameState, tile: TileId, riichi: boolean): AppliedDecisionAction {
  if ((state.forbiddenDiscards ?? []).includes(tile)) {
    throw new Error(`Cannot discard ${tile} immediately after call due to kuikae restriction.`);
  }
  const remainingHand = removeOne(getSelfHandForDiscard(state), tile);
  return {
    state: {
      ...state,
      phase: undefined,
      forbiddenDiscards: undefined,
      temporaryFuriten: undefined,
      lastDraw: undefined,
      lastDiscard: { tile, tsumogiri: state.lastDraw === tile, playerIndex: 0 },
      lastKan: undefined,
      round: {
        ...state.round,
        riichiSticks: riichi ? state.round.riichiSticks + 1 : state.round.riichiSticks,
      },
      self: {
        ...state.self,
        hand: remainingHand,
        riichi: riichi ? true : state.self.riichi,
        points: riichi ? state.self.points - 1000 : state.self.points,
        discards: [...state.self.discards, { tile, tsumogiri: state.lastDraw === tile }],
      },
    },
    terminal: false,
  };
}

function applyCallAction(
  state: GameState,
  action: Extract<DecisionAction, { type: "chi" | "pon" }>,
): AppliedDecisionAction {
  const calledTile = action.calledTile;
  const consumed = action.type === "pon"
    ? [calledTile, calledTile]
    : removeOne(action.tiles, calledTile);
  const call: Call = {
    type: action.type,
    tiles: action.tiles,
    calledTile,
    from: getCallFrom(state.lastDiscard?.playerIndex),
  };
  const handAfterCall = removeTiles(state.self.hand ?? [], consumed);
  const calledState: GameState = {
    ...state,
      phase: action.discard ? undefined : "after_call_discard",
      forbiddenDiscards: getPostCallForbiddenDiscards(action),
      temporaryFuriten: state.temporaryFuriten,
    lastDraw: undefined,
    lastDiscard: undefined,
    lastKan: undefined,
    self: {
      ...state.self,
      hand: handAfterCall,
      calls: [...state.self.calls, call],
      menzen: false,
    },
  };
  if (!action.discard) {
    return { state: calledState, terminal: false };
  }
  return applyDiscardAction(calledState, action.discard, false);
}

function applyKanAction(
  state: GameState,
  action: Extract<DecisionAction, { type: "minkan" | "ankan" | "kakan" }>,
): AppliedDecisionAction {
  const tile = action.tiles[0];
  const consumed = action.type === "ankan"
    ? [tile, tile, tile, tile]
    : action.type === "minkan"
      ? [tile, tile, tile]
      : [tile];
  const call: Call = {
    type: action.type,
    tiles: action.tiles,
    calledTile: action.type === "minkan" ? action.calledTile : tile,
    from: action.type === "minkan" ? getCallFrom(state.lastDiscard?.playerIndex) : "self",
  };
  const calls = action.type === "kakan"
    ? upgradePonToKakan(state.self.calls, tile, call)
    : [...state.self.calls, call];
  return {
    state: {
      ...state,
      phase: action.type === "kakan" ? "chankan" : undefined,
      forbiddenDiscards: undefined,
      temporaryFuriten: state.temporaryFuriten,
      lastDraw: undefined,
      lastDiscard: undefined,
      lastKan: { type: action.type, tile, playerIndex: 0 },
      self: {
        ...state.self,
        hand: removeTiles(getSelfHandForDiscard(state), consumed),
        calls,
        menzen: action.type === "ankan" ? state.self.menzen : false,
      },
    },
    terminal: false,
  };
}

function upgradePonToKakan(calls: readonly Call[], tile: TileId, kakan: Call): Call[] {
  const index = calls.findIndex((call) => call.type === "pon" && (call.calledTile ?? call.tiles[0]) === tile);
  if (index < 0) {
    return [...calls, kakan];
  }
  return calls.map((call, callIndex) => callIndex === index ? kakan : call);
}

function getSelfHandForDiscard(state: GameState): TileId[] {
  return [
    ...(state.self.hand ?? []),
    ...(state.lastDraw ? [state.lastDraw] : []),
  ];
}

function canRonCurrentDiscard(state: GameState): boolean {
  const discard = state.lastDiscard;
  const chankanTile = state.phase === "chankan" ? state.lastKan?.tile : undefined;
  if ((!discard && !chankanTile) || discard?.playerIndex === 0 || state.temporaryFuriten) {
    return false;
  }
  const winningTile = chankanTile ?? discard!.tile;
  const result = calculateAgariScore({
    hand: [...(state.self.hand ?? []), winningTile],
    winningTile,
    method: "ron",
    calls: state.self.calls,
    seatWind: state.self.seatWind,
    bakaze: state.round.bakaze,
    honba: state.round.honba,
    riichiSticks: state.round.riichiSticks,
    rules: state.rules,
    riichi: state.self.riichi,
    ippatsu: state.self.ippatsu,
    chankan: state.phase === "chankan",
    houtei: state.phase !== "chankan" && state.round.turn >= 18,
    doraIndicators: state.doraIndicators,
  });
  return result.status === "scored";
}

function removeTiles(hand: readonly TileId[], tiles: readonly TileId[]): TileId[] {
  let rest = [...hand];
  for (const tile of tiles) {
    rest = removeOne(rest, tile);
  }
  return rest;
}

function removeOne(hand: readonly TileId[], tile: TileId): TileId[] {
  const rest = [...hand];
  const index = rest.indexOf(tile);
  if (index < 0) {
    throw new Error(`Cannot remove missing tile ${tile} from hand.`);
  }
  rest.splice(index, 1);
  return rest;
}

function getCallFrom(playerIndex: number | undefined): CallFrom | undefined {
  if (playerIndex === 1) {
    return "right";
  }
  if (playerIndex === 2) {
    return "across";
  }
  if (playerIndex === 3) {
    return "left";
  }
  return undefined;
}

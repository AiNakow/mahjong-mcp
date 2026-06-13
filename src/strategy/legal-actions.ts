import type { Call, GameState } from "../core/state.ts";
import type { TileId } from "../core/tile.ts";
import type { DecisionAction, DecisionPhase } from "./action-types.ts";

export interface LegalAction {
  action: DecisionAction;
  phase: DecisionPhase;
  category: "discard" | "riichi" | "agari" | "call" | "kan" | "pass";
}

export function determineDecisionPhase(state: GameState): DecisionPhase {
  if (state.lastDraw && !state.lastDiscard) {
    return "self_draw";
  }
  if (state.lastDiscard && state.lastDiscard.playerIndex !== 0) {
    return "opponent_discard";
  }
  return "unknown";
}

export function generateLegalActions(state: GameState): LegalAction[] {
  const phase = determineDecisionPhase(state);
  if (phase === "self_draw") {
    return [
      ...generateSelfDrawAgariActions(state, phase),
      ...generateSelfDrawKanActions(state, phase),
      ...generateDiscardActions(state, phase),
    ];
  }
  if (phase === "opponent_discard") {
    return [
      ...generateOpponentDiscardKanActions(state, phase),
      { action: { type: "pass" }, phase, category: "pass" },
    ];
  }
  return generateDiscardActions(state, phase);
}

function generateSelfDrawAgariActions(state: GameState, phase: DecisionPhase): LegalAction[] {
  return state.lastDraw
    ? [{ action: { type: "tsumo" }, phase, category: "agari" }]
    : [];
}

function generateDiscardActions(state: GameState, phase: DecisionPhase): LegalAction[] {
  return uniqueTiles(getSelfHandForDiscard(state)).map((tile) => ({
    action: { type: "discard", tile },
    phase,
    category: "discard",
  }));
}

function generateSelfDrawKanActions(state: GameState, phase: DecisionPhase): LegalAction[] {
  if (state.self.riichi) {
    return [];
  }
  const hand = getSelfHandForDiscard(state);
  const counts = countTiles(hand);
  const ankanActions = [...counts.entries()]
    .filter(([, count]) => count >= 4)
    .map(([tile]) => ({
      action: { type: "ankan" as const, tiles: [tile, tile, tile, tile] },
      phase,
      category: "kan" as const,
    }));
  const kakanActions = state.self.calls
    .filter((call) => call.type === "pon")
    .flatMap((call) => {
      const tile = getCallBaseTile(call);
      if (!tile || (counts.get(tile) ?? 0) < 1) {
        return [];
      }
      return [{
        action: { type: "kakan" as const, tiles: [tile, tile, tile, tile] },
        phase,
        category: "kan" as const,
      }];
    });
  return [...ankanActions, ...kakanActions];
}

function generateOpponentDiscardKanActions(state: GameState, phase: DecisionPhase): LegalAction[] {
  const calledTile = state.lastDiscard?.tile;
  if (!calledTile || state.self.riichi || state.lastDiscard?.playerIndex === 0) {
    return [];
  }
  const count = (state.self.hand ?? []).filter((tile) => tile === calledTile).length;
  if (count < 3) {
    return [];
  }
  return [{
    action: {
      type: "minkan",
      tiles: [calledTile, calledTile, calledTile, calledTile],
      calledTile,
    },
    phase,
    category: "kan",
  }];
}

function getSelfHandForDiscard(state: GameState): TileId[] {
  return [
    ...(state.self.hand ?? []),
    ...(state.lastDraw ? [state.lastDraw] : []),
  ];
}

function uniqueTiles(tiles: readonly TileId[]): TileId[] {
  return [...new Set(tiles)];
}

function countTiles(tiles: readonly TileId[]): Map<TileId, number> {
  const counts = new Map<TileId, number>();
  for (const tile of tiles) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  return counts;
}

function getCallBaseTile(call: Call): TileId | undefined {
  return call.calledTile ?? call.tiles[0];
}

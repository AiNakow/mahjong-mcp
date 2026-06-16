import type { Call, GameState } from "../core/state.ts";
import { tileFromId, type TileId } from "../core/tile.ts";
import { analyzeHandText } from "../service/analyze.ts";
import type { DecisionAction, DecisionPhase } from "./action-types.ts";

export interface LegalAction {
  action: DecisionAction;
  phase: DecisionPhase;
  category: "discard" | "riichi" | "agari" | "call" | "kan" | "pass";
}

export function determineDecisionPhase(state: GameState): DecisionPhase {
  if (state.phase) {
    return state.phase;
  }
  if (state.lastDraw && !state.lastDiscard) {
    return state.lastKan?.playerIndex === 0 ? "rinshan_draw" : "self_draw";
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
      ...generateRiichiActions(state, phase),
      ...generateSelfDrawKanActions(state, phase),
      ...generateDiscardActions(state, phase),
    ];
  }
  if (phase === "rinshan_draw") {
    return [
      ...generateSelfDrawAgariActions(state, phase),
      ...generateRiichiActions(state, phase),
      ...generateSelfDrawKanActions(state, phase),
      ...generateDiscardActions(state, phase),
    ];
  }
  if (phase === "chankan") {
    return [
      ...generateChankanRonActions(state, phase),
      { action: { type: "pass" }, phase, category: "pass" },
    ];
  }
  if (phase === "opponent_discard") {
    return [
      ...generateRonActions(state, phase),
      ...generatePonActions(state, phase),
      ...generateChiActions(state, phase),
      ...generateOpponentDiscardKanActions(state, phase),
      { action: { type: "pass" }, phase, category: "pass" },
    ];
  }
  if (phase === "after_call_discard") {
    return generateDiscardActions(state, phase);
  }
  return [
    ...generateRiichiActions(state, phase),
    ...generateDiscardActions(state, phase),
  ];
}

function generateSelfDrawAgariActions(state: GameState, phase: DecisionPhase): LegalAction[] {
  return state.lastDraw
    ? [{ action: { type: "tsumo" }, phase, category: "agari" }]
    : [];
}

function generateRonActions(state: GameState, phase: DecisionPhase): LegalAction[] {
  if (!state.lastDiscard || state.lastDiscard.playerIndex === 0) {
    return [];
  }
  return [{ action: { type: "ron" }, phase, category: "agari" }];
}

function generateChankanRonActions(state: GameState, phase: DecisionPhase): LegalAction[] {
  if (!state.lastKan || state.lastKan.playerIndex === 0 || state.lastKan.type !== "kakan") {
    return [];
  }
  return [{ action: { type: "ron" }, phase, category: "agari" }];
}

function generateDiscardActions(state: GameState, phase: DecisionPhase): LegalAction[] {
  const forbidden = new Set(state.forbiddenDiscards ?? []);
  return uniqueTiles(getSelfHandForDiscard(state))
    .filter((tile) => !forbidden.has(tile))
    .map((tile) => ({
      action: { type: "discard", tile },
      phase,
      category: "discard",
    }));
}

function generateRiichiActions(state: GameState, phase: DecisionPhase): LegalAction[] {
  if (!canDeclareRiichi(state)) {
    return [];
  }
  return uniqueTiles(getSelfHandForDiscard(state)).map((tile) => ({
    action: { type: "riichi", tile },
    phase,
    category: "riichi",
  }));
}

function generateSelfDrawKanActions(state: GameState, phase: DecisionPhase): LegalAction[] {
  if (state.self.riichi) {
    return generateRiichiAnkanActions(state, phase);
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

function generateRiichiAnkanActions(state: GameState, phase: DecisionPhase): LegalAction[] {
  const drawnTile = state.lastDraw;
  if (!drawnTile) {
    return [];
  }
  const closedCount = (state.self.hand ?? []).filter((tile) => tile === drawnTile).length;
  const totalCount = getSelfHandForDiscard(state).filter((tile) => tile === drawnTile).length;
  if (closedCount !== 3 || totalCount !== 4) {
    return [];
  }
  if (!keepsRiichiWaitsAfterAnkan(state, drawnTile)) {
    return [];
  }
  return [{
    action: { type: "ankan", tiles: [drawnTile, drawnTile, drawnTile, drawnTile] },
    phase,
    category: "kan",
  }];
}

function keepsRiichiWaitsAfterAnkan(state: GameState, kanTile: TileId): boolean {
  try {
    const before = analyzeDrawWaits(state.self.hand ?? [], state);
    const afterHand = removeTiles(getSelfHandForDiscard(state), [kanTile, kanTile, kanTile, kanTile]);
    const after = analyzeDrawWaits(afterHand, state);
    return sameTileSet(before, after);
  } catch {
    return false;
  }
}

function analyzeDrawWaits(hand: readonly TileId[], state: GameState): Set<TileId> {
  const analysis = analyzeHandText({
    text: hand.join(""),
    mode: hasOpenCall(state) ? 1 : 0,
    includeRaw: false,
  });
  if (analysis.kind !== "draw" || analysis.shanten !== 0) {
    return new Set();
  }
  return new Set(analysis.draws.map((draw) => draw.id));
}

function sameTileSet(a: ReadonlySet<TileId>, b: ReadonlySet<TileId>): boolean {
  return a.size === b.size && [...a].every((tile) => b.has(tile));
}

function generatePonActions(state: GameState, phase: DecisionPhase): LegalAction[] {
  const calledTile = state.lastDiscard?.tile;
  if (!calledTile || state.self.riichi || state.lastDiscard?.playerIndex === 0) {
    return [];
  }
  const count = (state.self.hand ?? []).filter((tile) => tile === calledTile).length;
  if (count < 2) {
    return [];
  }
  return [{
    action: {
      type: "pon",
      tiles: [calledTile, calledTile, calledTile],
      calledTile,
    },
    phase,
    category: "call",
  }];
}

function generateChiActions(state: GameState, phase: DecisionPhase): LegalAction[] {
  const calledTile = state.lastDiscard?.tile;
  if (!calledTile || state.self.riichi || state.lastDiscard?.playerIndex !== 3) {
    return [];
  }
  const tile = tileFromId(calledTile);
  if (tile.suit === "z") {
    return [];
  }

  const actions: LegalAction[] = [];
  for (const start of [tile.rank - 2, tile.rank - 1, tile.rank]) {
    if (start < 1 || start > 7) {
      continue;
    }
    const sequence = [start, start + 1, start + 2].map((rank) => `${rank}${tile.suit}` as TileId);
    if (!sequence.includes(calledTile)) {
      continue;
    }
    const consumed = sequence.filter((item) => item !== calledTile);
    if (!hasTiles(state.self.hand ?? [], consumed)) {
      continue;
    }
    actions.push({
      action: {
        type: "chi",
        tiles: sequence,
        calledTile,
      },
      phase,
      category: "call",
    });
  }
  return actions;
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

function hasTiles(hand: readonly TileId[], tiles: readonly TileId[]): boolean {
  const rest = [...hand];
  for (const tile of tiles) {
    const index = rest.indexOf(tile);
    if (index < 0) {
      return false;
    }
    rest.splice(index, 1);
  }
  return true;
}

function removeTiles(hand: readonly TileId[], tiles: readonly TileId[]): TileId[] {
  const rest = [...hand];
  for (const tile of tiles) {
    const index = rest.indexOf(tile);
    if (index >= 0) {
      rest.splice(index, 1);
    }
  }
  return rest;
}

function canDeclareRiichi(state: GameState): boolean {
  return state.self.menzen
    && !state.self.riichi
    && state.self.points >= 1000
    && state.round.turn < 18;
}

function hasOpenCall(state: GameState): boolean {
  return state.self.calls.some((call) => call.type !== "ankan");
}

function getCallBaseTile(call: Call): TileId | undefined {
  return call.calledTile ?? call.tiles[0];
}

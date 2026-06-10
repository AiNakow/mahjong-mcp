import assert from "node:assert/strict";
import test from "node:test";

import {
  countTiles,
  countsToTiles,
  tilesToCounts34,
} from "../src/core/counts.ts";
import {
  parseTileGroups,
  TILES_34,
} from "../src/core/tile.ts";
import {
  analyzeCounts,
  analyzeHand,
  analyzeTiles,
  isValidHandstr,
  strToCount,
  strToList,
} from "../src/hand/paili.ts";

test("parseTileGroups parses compact tile strings", () => {
  assert.deepEqual(parseTileGroups("123m456p789s123z"), [
    "1m", "2m", "3m",
    "4p", "5p", "6p",
    "7s", "8s", "9s",
    "1z", "2z", "3z",
  ]);
});

test("Counts34 conversion round-trips tiles", () => {
  const tiles = parseTileGroups("1123m55p17z");
  const counts = tilesToCounts34(tiles);

  assert.equal(counts.length, 34);
  assert.equal(countTiles(counts), tiles.length);
  assert.deepEqual(countsToTiles(counts), [
    "1m", "1m", "2m", "3m", "5p", "5p", "1z", "7z",
  ]);
});

test("hand string validation accepts valid hands and rejects invalid hands", () => {
  assert.equal(isValidHandstr("3456m3455p123788s"), true);
  assert.equal(isValidHandstr("123m456p789s12344z"), true);
  assert.equal(isValidHandstr(""), false);
  assert.equal(isValidHandstr("123m456p789s12348z"), false);
  assert.equal(isValidHandstr("11111m234p567s11z"), false);
  assert.equal(isValidHandstr("123m456p789s8z"), false);
});

test("strToList and strToCount use shared core tile definitions", () => {
  const hand = "19m19p19s1234567z";
  const tiles = strToList(hand);
  const counts = strToCount(hand);

  assert.equal(tiles.length, 13);
  assert.equal(countTiles(counts), 13);
  assert.equal(counts[TILES_34.indexOf("1z")], 1);
  assert.equal(counts[TILES_34.indexOf("7z")], 1);
});

test("analyzeHand matches reference discard sample", () => {
  const result = analyzeHand("3456m3455p123788s", 0);

  assert.equal(result.kind, "discard");
  assert.equal(result.tile_count, 14);
  assert.equal(result.shanten, 1);
  assert.equal(result.is_tenpai, false);
  assert.equal(result.is_agari, false);
  assert.equal(result.discards[0].discard.id, "7s");
  assert.equal(result.discards[0].total_waits, 50);
  assert.deepEqual(result.discards[0].good_shape_draws, [
    "2m", "4m", "5m", "7m", "4p", "5p", "6p", "8s",
  ]);
});

test("analyzeHand handles chiitoi and kokushi representative cases", () => {
  const chiitoi = analyzeHand("11223344556677m", 0);
  const kokushi = analyzeHand("19m19p19s1234567z", 0);

  assert.equal(chiitoi.kind, "discard");
  assert.equal(chiitoi.shanten, 0);
  assert.equal(chiitoi.is_tenpai, true);
  assert.equal(chiitoi.is_agari, true);
  assert.equal(chiitoi.discards[0].discard.id, "2m");
  assert.equal(chiitoi.discards[0].total_waits, 8);

  assert.equal(kokushi.kind, "draw");
  assert.equal(kokushi.shanten, 0);
  assert.equal(kokushi.is_tenpai, true);
  assert.equal(kokushi.draws.length, 13);
});

test("analyzeTiles and analyzeCounts expose lower-level APIs", () => {
  const tiles = parseTileGroups("123m456p789s1z");
  const fromTiles = analyzeTiles(tiles, 0);
  const fromCounts = analyzeCounts(tilesToCounts34(tiles), tiles, 0);

  assert.deepEqual(fromTiles, fromCounts);
  assert.equal(fromTiles.kind, "draw");
  assert.equal(fromTiles.shanten, 0);
  assert.deepEqual(fromTiles.draws, [{ id: "1z", remaining: 3 }]);
});

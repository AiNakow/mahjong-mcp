import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_NANIKIRU_POLICY } from "../src/strategy/nanikiru-policy.ts";
import { evaluateValuePotential } from "../src/strategy/evaluators/evaluate-value.ts";
import { analyzeHandText } from "../src/service/analyze.ts";
import { evaluateNanikiru } from "../src/strategy/evaluate-nanikiru.ts";

test("evaluateValuePotential uses primary route plus discounted secondary route", () => {
  const result = evaluateValuePotential([
    "2m", "3m", "4m", "5m", "6m", "7m",
    "2p", "3p", "4p",
    "5z", "5z",
  ], "1z", DEFAULT_NANIKIRU_POLICY);

  assert.equal(result.score, 70.35);
  assert.ok(result.reasons.some((reason) => (
    reason.data?.primaryRoute === "yakuhai"
    && reason.data?.secondaryRoute === "tanyao"
  )));
  assert.ok(result.reasons.some((reason) => reason.data?.tanyaoStrength === 0.35));
});

test("evaluateValuePotential can select yakuhai as primary route when tanyao is weak", () => {
  const result = evaluateValuePotential([
    "1m", "9m", "2p", "3p", "4p",
    "5z", "5z",
    "7z",
  ], "3s", DEFAULT_NANIKIRU_POLICY);

  assert.equal(result.score, 80);
  assert.ok(result.reasons.some((reason) => reason.data?.primaryRoute === "yakuhai"));
});

test("evaluateValuePotential treats seat and round wind pairs as yakuhai", () => {
  const result = evaluateValuePotential([
    "1m", "9m", "2p", "3p", "4p",
    "1z", "1z",
    "7z",
  ], "3s", DEFAULT_NANIKIRU_POLICY, {
    context: {
      seatWind: "1z",
    },
  });

  assert.equal(result.score, 80);
  assert.ok(result.reasons.some((reason) => (
    reason.data?.primaryRoute === "yakuhai"
    || String(reason.message).includes("役牌对子 1z")
  )));
});

test("evaluateValuePotential disables open tanyao route when kuitan is off", () => {
  const result = evaluateValuePotential([
    "2m", "4m", "6m", "8m",
    "2p", "4p", "6p", "8p",
  ], "1z", DEFAULT_NANIKIRU_POLICY, {
    context: {
      calls: [{ type: "chi", tiles: ["2s", "3s", "4s"], calledTile: "3s" }],
      rules: {
        akaDora: true,
        kuitan: false,
        doubleRon: true,
        countDoubleYakuman: false,
      },
    },
  });

  assert.equal(result.score, 0);
});

test("evaluateValuePotential supports honitsu as secondary route", () => {
  const result = evaluateValuePotential([
    "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m",
    "5z", "5z",
  ], "9p", DEFAULT_NANIKIRU_POLICY);

  assert.equal(result.score, 108);
  assert.ok(result.reasons.some((reason) => (
    reason.data?.primaryRoute === "yakuhai"
    && reason.data?.secondaryRoute === "honitsu"
  )));
});

test("evaluateValuePotential rewards breaking yakuhai pair for tanyao route", () => {
  const result = evaluateValuePotential([
    "3m", "4m", "6m", "7m", "8m",
    "3p", "4p",
    "7s", "7s", "7s", "5s", "5s",
    "6z",
  ], "6z", DEFAULT_NANIKIRU_POLICY);

  assert.equal(result.score, 92);
  assert.ok(result.reasons.some((reason) => (
    String(reason.message).includes("拆役牌对子")
    && reason.data?.breakingYakuhaiPair === true
  )));
});

test("evaluateValuePotential supports ittsu route", () => {
  const result = evaluateValuePotential([
    "1m", "2m", "3m",
    "4m", "5m", "6m",
    "7m", "8m",
    "2p", "3p", "4p",
  ], "9p", DEFAULT_NANIKIRU_POLICY);

  assert.ok(result.score > 0);
  assert.ok(result.reasons.some((reason) => reason.data?.primaryRoute === "ittsu"));
  assert.ok(result.reasons.some((reason) => reason.data?.suit === "m"));
});

test("evaluateValuePotential supports sanshoku route", () => {
  const result = evaluateValuePotential([
    "2m", "3m", "4m",
    "2p", "3p", "4p",
    "2s", "3s",
    "7m", "8m", "9m",
  ], "1z", DEFAULT_NANIKIRU_POLICY);

  assert.ok(result.score > 0);
  assert.ok(result.reasons.some((reason) => reason.data?.primaryRoute === "sanshoku"));
  assert.ok(result.reasons.some((reason) => reason.data?.sequence === "234"));
});

test("evaluateValuePotential supports chanta route", () => {
  const result = evaluateValuePotential([
    "1m", "2m", "3m",
    "7p", "8p", "9p",
    "1s", "9s",
    "1z", "1z",
    "2z",
  ], "4m", DEFAULT_NANIKIRU_POLICY);

  assert.ok(result.score > 0);
  assert.ok(result.reasons.some((reason) => reason.data?.primaryRoute === "chanta"));
  assert.ok(result.reasons.some((reason) => Number(reason.data?.chantaBlockCount) >= 3));
});

test("evaluateValuePotential supports toitoi route", () => {
  const result = evaluateValuePotential([
    "2m", "2m", "2m",
    "5p", "5p",
    "8s", "8s",
    "3z", "3z",
    "7m", "8m", "9m",
  ], "1p", DEFAULT_NANIKIRU_POLICY);

  assert.ok(result.score > 0);
  assert.ok(result.reasons.some((reason) => (
    reason.data?.primaryRoute === "toitoi"
    || reason.data?.secondaryRoute === "toitoi"
  )));
  assert.ok(result.reasons.some((reason) => reason.data?.tripletCount === 1));
});

test("evaluateValuePotential rewards dora, aka dora and dora-side tiles before tenpai", () => {
  const result = evaluateValuePotential([
    "5m", "6m", "7m",
    "2p", "3p", "4p",
    "5s", "6s",
    "1z", "1z",
  ], "9p", DEFAULT_NANIKIRU_POLICY, {
    context: {
      doraIndicators: ["4m"],
      akaDoraCount: 1,
    },
  });

  assert.ok(result.score >= DEFAULT_NANIKIRU_POLICY.doraBonus);
  assert.ok(result.reasons.some((reason) => (
    reason.data?.primaryRoute === "dora"
    && reason.data?.doraCount === 1
    && reason.data?.akaDoraCount === 1
  )));
});

test("evaluateNanikiru adds two-layer value for iishanten candidates", () => {
  const analysis = analyzeHandText("3456m3455p123788s");
  assert.equal(analysis.kind, "discard");

  if (analysis.kind !== "discard") {
    throw new Error("expected discard analysis");
  }

  const evaluated = evaluateNanikiru(analysis);
  const candidate = evaluated.candidates.find((item) => (
    item.reasons.some((reason) => reason.data?.primaryRoute === "two_layer_scoring")
  ));

  assert.ok(candidate);
  assert.ok(candidate.scoreBreakdown.value > 0);
  assert.ok(candidate.reasons.some((reason) => (
    reason.type === "value"
    && String(reason.message).includes("一向听进张转听牌")
  )));
});

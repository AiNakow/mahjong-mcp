import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_NANIKIRU_POLICY } from "../src/strategy/nanikiru-policy.ts";
import { evaluateValuePotential } from "../src/strategy/evaluators/evaluate-value.ts";

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

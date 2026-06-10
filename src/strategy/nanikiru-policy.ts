export interface NanikiruPolicy {
  shantenWeight: number;
  ukeireWeight: number;
  goodShapeWeight: number;
  shapeWeight: number;
  valueWeight: number;

  yakuhaiPairBonus: number;
  tanyaoLeanBonus: number;
  chiitoiPairThreshold: number;
  chiitoiBonus: number;
  honitsuSuitThreshold: number;
  honitsuBonus: number;
  secondaryValueRouteRatio: number;
  yakuhaiTanyaoConflictDecay: number;
  breakYakuhaiPairForTanyaoBonus: number;
  useScoringForTenpaiValue: boolean;
  scoringValueDivisor: number;
}

export const DEFAULT_NANIKIRU_POLICY: NanikiruPolicy = {
  shantenWeight: 1000,
  ukeireWeight: 10,
  goodShapeWeight: 8,
  shapeWeight: 1,
  valueWeight: 1,

  yakuhaiPairBonus: 80,
  tanyaoLeanBonus: 60,
  chiitoiPairThreshold: 4,
  chiitoiBonus: 50,
  honitsuSuitThreshold: 8,
  honitsuBonus: 80,
  secondaryValueRouteRatio: 0.35,
  yakuhaiTanyaoConflictDecay: 0.6,
  breakYakuhaiPairForTanyaoBonus: 50,
  useScoringForTenpaiValue: true,
  scoringValueDivisor: 100,
};

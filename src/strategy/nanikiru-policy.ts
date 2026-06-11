export interface NanikiruPolicy {
  shantenWeight: number;
  ukeireWeight: number;
  goodShapeWeight: number;
  shapeWeight: number;
  routeWeight: number;
  valueWeight: number;
  defenseWeight: number;

  yakuhaiPairBonus: number;
  tanyaoLeanBonus: number;
  chiitoiPairThreshold: number;
  chiitoiBonus: number;
  honitsuSuitThreshold: number;
  honitsuBonus: number;
  ittsuBonus: number;
  sanshokuBonus: number;
  chantaBonus: number;
  toitoiBonus: number;
  doraBonus: number;
  akaDoraBonus: number;
  doraSideBonus: number;
  compositeRouteBonus: number;
  useTwoLayerValueForIishanten: boolean;
  twoLayerValueDivisor: number;
  twoLayerMinAveragePoints: number;
  twoLayerMaxDrawTypes: number;
  twoLayerMaxTenpaiDiscards: number;
  assumeRiichiForMenzenTwoLayer: boolean;
  secondaryValueRouteRatio: number;
  yakuhaiTanyaoConflictDecay: number;
  breakYakuhaiPairForTanyaoBonus: number;
  useScoringForTenpaiValue: boolean;
  scoringValueDivisor: number;
  sameShantenImprovementValueDivisor: number;
  sameShantenImprovementMinValue: number;
  sameShantenImprovementMaxDrawTypes: number;
  routeCommitmentBonus: number;
  routeImprovementBonus: number;
  routeBreakPenalty: number;
  shantenBackUkeireMultiplier: number;
  shantenBackGoodShapeMultiplier: number;
  shantenBackDefenseOverrideDelta: number;
  earlyLowValueTenpaiTurnMax: number;
  lowValueTenpaiWaitsMax: number;
  shantenBackImprovementMinWaits: number;
  shantenBackImprovementMinGoodShape: number;
  shantenBackImprovementShantenMultiplier: number;
  shantenBackImprovementUkeireMultiplier: number;
  shantenBackImprovementGoodShapeMultiplier: number;
}

export interface WeightPolicy {
  shanten: number;
  ukeire: number;
  goodShape: number;
  shape: number;
  route: number;
  value: number;
  defense: number;
}

export interface RoutePolicy {
  yakuhaiPairBonus: number;
  tanyaoLeanBonus: number;
  chiitoiPairThreshold: number;
  chiitoiBonus: number;
  honitsuSuitThreshold: number;
  honitsuBonus: number;
  ittsuBonus: number;
  sanshokuBonus: number;
  chantaBonus: number;
  toitoiBonus: number;
  doraBonus: number;
  akaDoraBonus: number;
  doraSideBonus: number;
  compositeRouteBonus: number;
  secondaryValueRouteRatio: number;
  yakuhaiTanyaoConflictDecay: number;
  breakYakuhaiPairForTanyaoBonus: number;
  routeCommitmentBonus: number;
  routeImprovementBonus: number;
  routeBreakPenalty: number;
}

export interface ValuePolicy {
  useScoringForTenpaiValue: boolean;
  scoringValueDivisor: number;
  useTwoLayerValueForIishanten: boolean;
  twoLayerValueDivisor: number;
  twoLayerMinAveragePoints: number;
  twoLayerMaxDrawTypes: number;
  twoLayerMaxTenpaiDiscards: number;
  assumeRiichiForMenzenTwoLayer: boolean;
}

export interface ImprovementPolicy {
  sameShantenValueDivisor: number;
  sameShantenMinValue: number;
  sameShantenMaxDrawTypes: number;
  earlyLowValueTenpaiTurnMax: number;
  lowValueTenpaiWaitsMax: number;
  shantenBackImprovementMinWaits: number;
  shantenBackImprovementMinGoodShape: number;
  shantenBackImprovementShantenMultiplier: number;
  shantenBackImprovementUkeireMultiplier: number;
  shantenBackImprovementGoodShapeMultiplier: number;
}

export interface DefensePolicy {
  shantenBackDefenseOverrideDelta: number;
}

export interface ArbitrationPolicy {
  shantenBackUkeireMultiplier: number;
  shantenBackGoodShapeMultiplier: number;
}

export interface StrategyPolicy {
  weights: WeightPolicy;
  routes: RoutePolicy;
  value: ValuePolicy;
  improvement: ImprovementPolicy;
  defense: DefensePolicy;
  arbitration: ArbitrationPolicy;
}

export const DEFAULT_NANIKIRU_POLICY: NanikiruPolicy = {
  shantenWeight: 1000,
  ukeireWeight: 10,
  goodShapeWeight: 8,
  shapeWeight: 1,
  routeWeight: 1,
  valueWeight: 1,
  defenseWeight: 1,

  yakuhaiPairBonus: 80,
  tanyaoLeanBonus: 60,
  chiitoiPairThreshold: 4,
  chiitoiBonus: 50,
  honitsuSuitThreshold: 8,
  honitsuBonus: 80,
  ittsuBonus: 65,
  sanshokuBonus: 60,
  chantaBonus: 45,
  toitoiBonus: 55,
  doraBonus: 90,
  akaDoraBonus: 70,
  doraSideBonus: 18,
  compositeRouteBonus: 160,
  useTwoLayerValueForIishanten: true,
  twoLayerValueDivisor: 160,
  twoLayerMinAveragePoints: 1500,
  twoLayerMaxDrawTypes: 5,
  twoLayerMaxTenpaiDiscards: 2,
  assumeRiichiForMenzenTwoLayer: true,
  secondaryValueRouteRatio: 0.35,
  yakuhaiTanyaoConflictDecay: 0.6,
  breakYakuhaiPairForTanyaoBonus: 50,
  useScoringForTenpaiValue: true,
  scoringValueDivisor: 100,
  sameShantenImprovementValueDivisor: 120,
  sameShantenImprovementMinValue: 15,
  sameShantenImprovementMaxDrawTypes: 8,
  routeCommitmentBonus: 36,
  routeImprovementBonus: 55,
  routeBreakPenalty: 45,
  shantenBackUkeireMultiplier: 0.35,
  shantenBackGoodShapeMultiplier: 0.25,
  shantenBackDefenseOverrideDelta: 300,
  earlyLowValueTenpaiTurnMax: 6,
  lowValueTenpaiWaitsMax: 4,
  shantenBackImprovementMinWaits: 30,
  shantenBackImprovementMinGoodShape: 16,
  shantenBackImprovementShantenMultiplier: 0.4,
  shantenBackImprovementUkeireMultiplier: 0.7,
  shantenBackImprovementGoodShapeMultiplier: 0.7,
};

export function normalizeStrategyPolicy(
  policy: Partial<NanikiruPolicy> = {},
): NanikiruPolicy & { strategy: StrategyPolicy } {
  const merged: NanikiruPolicy = {
    ...DEFAULT_NANIKIRU_POLICY,
    ...policy,
  };

  return {
    ...merged,
    strategy: {
      weights: {
        shanten: merged.shantenWeight,
        ukeire: merged.ukeireWeight,
        goodShape: merged.goodShapeWeight,
        shape: merged.shapeWeight,
        route: merged.routeWeight,
        value: merged.valueWeight,
        defense: merged.defenseWeight,
      },
      routes: {
        yakuhaiPairBonus: merged.yakuhaiPairBonus,
        tanyaoLeanBonus: merged.tanyaoLeanBonus,
        chiitoiPairThreshold: merged.chiitoiPairThreshold,
        chiitoiBonus: merged.chiitoiBonus,
        honitsuSuitThreshold: merged.honitsuSuitThreshold,
        honitsuBonus: merged.honitsuBonus,
        ittsuBonus: merged.ittsuBonus,
        sanshokuBonus: merged.sanshokuBonus,
        chantaBonus: merged.chantaBonus,
        toitoiBonus: merged.toitoiBonus,
        doraBonus: merged.doraBonus,
        akaDoraBonus: merged.akaDoraBonus,
        doraSideBonus: merged.doraSideBonus,
        compositeRouteBonus: merged.compositeRouteBonus,
        secondaryValueRouteRatio: merged.secondaryValueRouteRatio,
        yakuhaiTanyaoConflictDecay: merged.yakuhaiTanyaoConflictDecay,
        breakYakuhaiPairForTanyaoBonus: merged.breakYakuhaiPairForTanyaoBonus,
        routeCommitmentBonus: merged.routeCommitmentBonus,
        routeImprovementBonus: merged.routeImprovementBonus,
        routeBreakPenalty: merged.routeBreakPenalty,
      },
      value: {
        useScoringForTenpaiValue: merged.useScoringForTenpaiValue,
        scoringValueDivisor: merged.scoringValueDivisor,
        useTwoLayerValueForIishanten: merged.useTwoLayerValueForIishanten,
        twoLayerValueDivisor: merged.twoLayerValueDivisor,
        twoLayerMinAveragePoints: merged.twoLayerMinAveragePoints,
        twoLayerMaxDrawTypes: merged.twoLayerMaxDrawTypes,
        twoLayerMaxTenpaiDiscards: merged.twoLayerMaxTenpaiDiscards,
        assumeRiichiForMenzenTwoLayer: merged.assumeRiichiForMenzenTwoLayer,
      },
      improvement: {
        sameShantenValueDivisor: merged.sameShantenImprovementValueDivisor,
        sameShantenMinValue: merged.sameShantenImprovementMinValue,
        sameShantenMaxDrawTypes: merged.sameShantenImprovementMaxDrawTypes,
        earlyLowValueTenpaiTurnMax: merged.earlyLowValueTenpaiTurnMax,
        lowValueTenpaiWaitsMax: merged.lowValueTenpaiWaitsMax,
        shantenBackImprovementMinWaits: merged.shantenBackImprovementMinWaits,
        shantenBackImprovementMinGoodShape: merged.shantenBackImprovementMinGoodShape,
        shantenBackImprovementShantenMultiplier: merged.shantenBackImprovementShantenMultiplier,
        shantenBackImprovementUkeireMultiplier: merged.shantenBackImprovementUkeireMultiplier,
        shantenBackImprovementGoodShapeMultiplier: merged.shantenBackImprovementGoodShapeMultiplier,
      },
      defense: {
        shantenBackDefenseOverrideDelta: merged.shantenBackDefenseOverrideDelta,
      },
      arbitration: {
        shantenBackUkeireMultiplier: merged.shantenBackUkeireMultiplier,
        shantenBackGoodShapeMultiplier: merged.shantenBackGoodShapeMultiplier,
      },
    },
  };
}

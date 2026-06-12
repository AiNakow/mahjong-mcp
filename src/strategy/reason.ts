export type ReasonType =
  | "shanten"
  | "ukeire"
  | "good_shape"
  | "shape"
  | "route"
  | "value"
  | "highPoints"
  | "defense"
  | "defenseComparison"
  | "riichi"
  | "placement"
  | "ev"
  | "risk"
  | "rule";

export interface Reason {
  type: ReasonType;
  polarity: "positive" | "negative" | "neutral";
  priority: number;
  message: string;
  data?: Record<string, unknown>;
}

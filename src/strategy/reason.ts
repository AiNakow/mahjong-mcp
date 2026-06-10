export type ReasonType =
  | "shanten"
  | "ukeire"
  | "good_shape"
  | "shape"
  | "value"
  | "defense"
  | "riichi"
  | "placement"
  | "risk"
  | "rule";

export interface Reason {
  type: ReasonType;
  polarity: "positive" | "negative" | "neutral";
  priority: number;
  message: string;
  data?: Record<string, unknown>;
}

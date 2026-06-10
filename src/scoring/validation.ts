import { DEFAULT_RULE_CONFIG } from "../core/rules.ts";
import type { AgariContext, ScoreWarning, ScoreWarningCode } from "./types.ts";
import { isMenzen } from "./yaku.ts";

export function validateAgariContext(context: AgariContext): ScoreWarning[] {
  const warnings: ScoreWarning[] = [];
  const menzen = isMenzen(context);
  const dealer = context.seatWind === "1z";

  if (!menzen && (context.riichi || context.doubleRiichi)) {
    warnings.push(error("riichi_open_hand", "副露手不能立直或两立直。"));
  }
  if (context.riichi && context.doubleRiichi) {
    warnings.push(error("double_riichi_with_riichi", "立直和两立直不能同时声明。"));
  }
  if (context.ippatsu && !context.riichi && !context.doubleRiichi) {
    warnings.push(error("ippatsu_without_riichi", "一发必须依附于立直或两立直。"));
  }
  if (context.tenhou && (!dealer || context.method !== "tsumo")) {
    warnings.push(error("tenhou_not_dealer_tsumo", "天和必须是庄家自摸。"));
  }
  if (context.chiihou && dealer) {
    warnings.push(error("chiihou_dealer", "地和不能由庄家成立。"));
  }
  if (context.chiihou && context.method !== "tsumo") {
    warnings.push(error("chiihou_not_tsumo", "地和必须是自摸。"));
  }
  if (context.haitei && context.houtei) {
    warnings.push(error("haitei_houtei_conflict", "海底摸月和河底捞鱼不能同时成立。"));
  }
  if (context.rinshan && context.chankan) {
    warnings.push(error("rinshan_chankan_conflict", "岭上开花和抢杠不能同时成立。"));
  }

  const rules = context.rules ?? DEFAULT_RULE_CONFIG;
  if ((context.akaDoraCount ?? 0) > 0 && !rules.akaDora) {
    warnings.push(warning("aka_dora_disabled", "规则未启用赤宝牌，赤宝牌翻数会被忽略。"));
  }
  if ((context.uraDoraIndicators?.length ?? 0) > 0 && !context.riichi && !context.doubleRiichi) {
    warnings.push(warning("ura_dora_without_riichi", "未立直时里宝牌不会计入翻数。"));
  }

  return warnings;
}

export function hasContextError(warnings: readonly ScoreWarning[]): boolean {
  return warnings.some((item) => item.severity === "error");
}

function error(code: ScoreWarningCode, message: string): ScoreWarning {
  return { code, message, severity: "error" };
}

function warning(code: ScoreWarningCode, message: string): ScoreWarning {
  return { code, message, severity: "warning" };
}

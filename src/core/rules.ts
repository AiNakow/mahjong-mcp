export interface RuleConfig {
  /**
   * 是否启用赤宝牌。
   *
   * 为 true 时，规则允许红 5m/5p/5s 出现，并在未来的计分和打点评估中
   * 作为宝牌处理。当前 paili 模块只做 34 种牌的牌理计算，还没有实现宝牌计分。
   */
  akaDora: boolean;

  /**
   * 是否允许食断。
   *
   * 为 true 时，副露手也可以使用断幺九作为役。为 false 时，断幺九只在
   * 门前清时成立。后续实现副露策略和役种判断时会用到这个配置。
   */
  kuitan: boolean;

  /**
   * 是否允许双响。
   *
   * 为 true 时，同一张弃牌可以被两家同时荣和。为 false 时，后续动作结算
   * 需要按具体规则处理，例如头跳。当前牌理模块尚未使用该配置。
   */
  doubleRon: boolean;
}

export const DEFAULT_RULE_CONFIG: RuleConfig = {
  // 常见在线立直麻将规则：启用赤宝牌。
  akaDora: true,
  // 常见现代立直麻将规则：允许食断。
  kuitan: true,
  // 默认允许双响，除非具体规则明确禁用。
  doubleRon: true,
};

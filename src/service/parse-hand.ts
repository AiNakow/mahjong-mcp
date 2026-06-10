export class HandTextParseError extends Error {
  constructor(input: string) {
    super(`无法从输入中解析手牌：${input}`);
    this.name = "HandTextParseError";
  }
}

export function parseHandText(input: string): string {
  const normalized = input.trim();
  if (!normalized) {
    throw new HandTextParseError(input);
  }

  const labeledMatch = normalized.match(/(?:手牌|牌姿|hand)\s*[:：]\s*([0-9mpsz\s]+)/i);
  const source = labeledMatch?.[1] ?? normalized;
  const compact = source.replace(/\s+/g, "");
  const handMatch = compact.match(/^(?:\d+[mps]|[1-7]+z)+/);

  if (!handMatch) {
    throw new HandTextParseError(input);
  }

  return handMatch[0];
}

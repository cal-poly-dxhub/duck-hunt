/** Fisher-Yates shuffle. `sort(() => Math.random() - 0.5)` is NOT uniform. */
export const shuffle = <T>(items: readonly T[]): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/** Strip inline <think>/<thinking>/<reasoning> blocks, including orphan open or close tags. */
export const stripReasoning = (raw: string): string => {
  let out = raw.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, "");
  out = out.replace(/^[\s\S]*?<\/(think|thinking|reasoning)>/i, "");
  out = out.replace(/<(think|thinking|reasoning)>[\s\S]*$/i, "");
  return out.trim();
};

export const validateUUID = (s: string | null | undefined): boolean => {
  if (!s) return false;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[10-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(s);
};

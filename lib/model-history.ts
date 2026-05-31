/** Histórico de modelos usados — persiste em settings como JSON array. */

export const MODEL_HISTORY_MAX = 10;

export function parseModelHistory(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
  } catch {
    return [];
  }
}

/** Prepend, dedup, limit — mais recente primeiro. */
export function prependModelHistory(existing: string[], model: string): string[] {
  const trimmed = model.trim();
  if (!trimmed) return existing;
  const filtered = existing.filter((m) => m !== trimmed);
  return [trimmed, ...filtered].slice(0, MODEL_HISTORY_MAX);
}

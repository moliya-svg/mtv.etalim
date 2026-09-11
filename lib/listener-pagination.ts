export const listenerPageSize = 250;

// Offsets come from a query string (/state) or JSON (/listeners/lookup).
export function listenerPageOffset(value: unknown): number | null {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'string' && !/^\d+$/.test(value)) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const offset = Number(value);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : null;
}

export function listenerPage<T>(rows: T[], offset: number) {
  return {
    rows: rows.slice(0, listenerPageSize),
    pagination: {
      nextOffset:
        rows.length > listenerPageSize ? offset + listenerPageSize : null,
    },
  };
}

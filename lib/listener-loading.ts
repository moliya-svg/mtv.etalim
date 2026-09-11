type FetchOptions = {
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

export async function loadJson<T>(
  url: string,
  init: RequestInit = {},
  { fetcher = fetch, timeoutMs = 20000 }: FetchOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetcher(url, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    });
    const result: unknown = await response.json();
    if (!response.ok) {
      throw new Error(
        result &&
          typeof result === 'object' &&
          'error' in result &&
          typeof result.error === 'string'
          ? result.error
          : 'Ma’lumotlarni yuklab bo‘lmadi. Qayta urinib ko‘ring.',
      );
    }
    if (controller.signal.aborted) throw new Error('So‘rov bekor qilindi.');
    return result as T;
  } catch (error) {
    if (timedOut) {
      throw new Error(
        'Server javobi kechikdi. «Yangilash»ni bosib qayta urinib ko‘ring.',
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}

type ListenerPage = {
  listeners: { id: string }[];
  pagination?: { nextOffset: number | null };
  scope?: unknown;
  cohort?: unknown;
  canViewAll?: boolean;
  ownerListenerId?: string;
};

// Only publish a complete response: a failed page must not replace a saved roster.
export async function loadListenerPages<T extends ListenerPage>(
  url: string,
  init: RequestInit = {},
  options: FetchOptions = {},
): Promise<T> {
  let first: T | undefined;
  let offset = 0;
  const rows = new Map<string, T['listeners'][number]>();
  const originalBody =
    typeof init.body === 'string' ? JSON.parse(init.body) : {};
  for (let page = 0; page < 10000; page++) {
    if (init.signal?.aborted) throw new Error('So‘rov bekor qilindi.');
    const post = init.method?.toUpperCase() === 'POST';
    const pageUrl =
      post || !offset
        ? url
        : `${url}${url.includes('?') ? '&' : '?'}offset=${offset}`;
    const result = await loadJson<T>(
      pageUrl,
      post && offset
        ? { ...init, body: JSON.stringify({ ...originalBody, offset }) }
        : init,
      options,
    );
    if (!result || !Array.isArray(result.listeners)) {
      throw new Error(
        'Tinglovchilar ro‘yxati noto‘g‘ri keldi. Qayta urinib ko‘ring.',
      );
    }
    if (
      first &&
      (JSON.stringify(first.scope) !== JSON.stringify(result.scope) ||
        JSON.stringify(first.cohort) !== JSON.stringify(result.cohort) ||
        first.canViewAll !== result.canViewAll ||
        first.ownerListenerId !== result.ownerListenerId)
    ) {
      throw new Error('Kirish huquqi yoki guruh o‘zgardi. Sahifani yangilang.');
    }
    first ??= result;
    for (const row of result.listeners) {
      if (!row || typeof row.id !== 'string' || !row.id) {
        throw new Error(
          'Tinglovchi yozuvi noto‘g‘ri keldi. Qayta urinib ko‘ring.',
        );
      }
      rows.set(row.id, row);
    }
    const next = result.pagination?.nextOffset;
    if (!result.pagination || next === null) {
      return {
        ...first,
        listeners: [...rows.values()],
        pagination: { nextOffset: null },
      };
    }
    if (
      !Number.isSafeInteger(next) ||
      Number(next) <= offset ||
      !result.listeners.length
    ) {
      throw new Error(
        'Ro‘yxat sahifalari noto‘g‘ri keldi. Qayta urinib ko‘ring.',
      );
    }
    offset = Number(next);
  }
  throw new Error('Ro‘yxatni to‘liq yuklab bo‘lmadi. Qayta urinib ko‘ring.');
}

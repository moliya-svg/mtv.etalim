import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadJson, loadListenerPages } from '../lib/listener-loading.ts';

test('loads every page beyond the previous 1000-row limit and retains metadata', async () => {
  const records = Array.from({ length: 1201 }, (_, i) => ({ id: String(i) }));
  const offsets = [];
  const result = await loadListenerPages(
    '/api/state',
    {},
    {
      fetcher: async (url) => {
        const offset = Number(
          new URL(url, 'https://example.test').searchParams.get('offset') || 0,
        );
        offsets.push(offset);
        const listeners = records.slice(offset, offset + 250);
        return Response.json({
          listeners,
          scope: { kind: 'staff', canViewAll: true },
          sources: { groups: ['group'] },
          pagination: {
            nextOffset:
              offset + listeners.length < records.length
                ? offset + listeners.length
                : null,
          },
        });
      },
    },
  );
  assert.deepEqual(offsets, [0, 250, 500, 750, 1000]);
  assert.equal(result.listeners.length, 1201);
  assert.deepEqual(result.sources, { groups: ['group'] });
  assert.equal(result.pagination.nextOffset, null);
});

test('lookup pagination preserves the selected cohort and audience on every page', async () => {
  const seen = [];
  const selection = {
    year: '2026',
    month: '09',
    category: 'Nomzod direktor',
    group: '56-guruh',
  };
  const result = await loadListenerPages(
    '/api/listeners/lookup',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mtv-audience': 'admin',
      },
      body: JSON.stringify(selection),
    },
    {
      fetcher: async (_url, options) => {
        const body = JSON.parse(options.body);
        seen.push({ body, headers: options.headers });
        return Response.json({
          found: true,
          cohort: selection,
          listeners: [{ id: String(body.offset || 0) }],
          pagination: { nextOffset: body.offset ? null : 1 },
        });
      },
    },
  );
  assert.deepEqual(seen[0].body, selection);
  assert.deepEqual(seen[1].body, { ...selection, offset: 1 });
  assert.ok(seen.every((call) => call.headers['x-mtv-audience'] === 'admin'));
  assert.equal(result.listeners.length, 2);
});

test('a failed later page rejects the whole load instead of returning a partial roster', async () => {
  let calls = 0;
  await assert.rejects(
    loadListenerPages(
      '/api/state',
      {},
      {
        fetcher: async () =>
          ++calls === 1
            ? Response.json({
                listeners: [{ id: 'first' }],
                pagination: { nextOffset: 1 },
              })
            : Response.json(
                { error: 'Temporary database error' },
                { status: 503 },
              ),
      },
    ),
    /Temporary database error/,
  );
  assert.equal(calls, 2);
});

test('a lost admin session mid-pagination cannot silently truncate the roster', async () => {
  let calls = 0;
  await assert.rejects(
    loadListenerPages(
      '/api/state',
      {},
      {
        fetcher: async () =>
          Response.json(
            ++calls === 1
              ? {
                  listeners: [{ id: 'first' }],
                  scope: { kind: 'staff' },
                  pagination: { nextOffset: 1 },
                }
              : {
                  listeners: [],
                  scope: { kind: 'anonymous' },
                  pagination: { nextOffset: null },
                },
          ),
      },
    ),
    /Kirish huquqi yoki guruh/,
  );
});

test('malformed or looping pagination fails promptly', async () => {
  for (const nextOffset of [0, -1, undefined, '250', 0.5]) {
    let calls = 0;
    await assert.rejects(
      loadListenerPages(
        '/api/state',
        {},
        {
          fetcher: async () => {
            calls++;
            return Response.json({
              listeners: [{ id: 'first' }],
              pagination: { nextOffset },
            });
          },
        },
      ),
      /sahifalari noto/,
    );
    assert.equal(calls, 1);
  }
});

test('lookup rejects an admin-to-device downgrade even within the same cohort', async () => {
  let calls = 0;
  await assert.rejects(
    loadListenerPages(
      '/api/listeners/lookup',
      { method: 'POST', body: '{}' },
      {
        fetcher: async () =>
          Response.json({
            cohort: { group: '56-guruh', year: '2026', month: '09' },
            listeners: [{ id: String(calls) }],
            canViewAll: ++calls === 1,
            ownerListenerId: calls === 1 ? '' : 'owner',
            pagination: { nextOffset: calls === 1 ? 1 : null },
          }),
      },
    ),
    /Kirish huquqi yoki guruh/,
  );
});

test('a timeout aborts the request and offers a retry message', async () => {
  let aborted = false;
  await assert.rejects(
    loadJson(
      '/api/state',
      {},
      {
        timeoutMs: 5,
        fetcher: (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => {
              aborted = true;
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      },
    ),
    /Server javobi kechikdi/,
  );
  assert.equal(aborted, true);
});

test('a stale aborted load cannot return data even when a transport ignores abort', async () => {
  const controller = new AbortController();
  await assert.rejects(
    loadListenerPages(
      '/api/state',
      { signal: controller.signal },
      {
        fetcher: async () => {
          controller.abort();
          return Response.json({ listeners: [{ id: 'stale' }] });
        },
      },
    ),
    /bekor qilindi/,
  );
});

test('the legacy single-page response remains compatible and duplicate IDs are not displayed twice', async () => {
  const result = await loadListenerPages(
    '/api/state',
    {},
    {
      fetcher: async () =>
        Response.json({ listeners: [{ id: 'same' }, { id: 'same' }] }),
    },
  );
  assert.equal(result.listeners.length, 1);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { isListenerAudience } from '../lib/listener-audience.ts';
import * as pagination from '../lib/listener-pagination.ts';

const routeCode = ts.transpileModule(
  readFileSync(new URL('../app/api/state/route.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const group56 = 'Nomzod direktor (56-guruh)';
const records = Array.from({ length: 1103 }, (_, index) => ({
  id: `listener-${index}`,
  group_name: group56,
  training_year: '2026',
  training_month: '09',
  category: 'Nomzod direktor',
}));

function setup({
  admin = false,
  device = null,
  audience = '',
  rows = records,
  databaseFails = false,
} = {}) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const query = strings.join('?');
    calls.push({ query, values });
    if (databaseFails) throw new Error('Database unavailable');
    if (query.includes('FROM listeners')) {
      assert.match(query, /WHERE id =/);
      return rows
        .filter((row) => row.id === values[0] && !row.deleted_at)
        .slice(0, 1);
    }
    return [];
  };
  sql.query = async (query, values) => {
    calls.push({ query, values });
    assert.match(query, /ORDER BY created_at ASC, id ASC/);
    assert.match(query, /deleted_at IS NULL/);
    assert.doesNotMatch(query, /\b(DELETE|INSERT|UPDATE|ALTER|DROP)\b/);
    const hasCohort = query.includes('group_name = $1');
    const [limit, offset] = values.slice(-2);
    assert.equal(limit, pagination.listenerPageSize + 1);
    return rows
      .filter(
        (row) =>
          !row.deleted_at &&
          (!hasCohort ||
            (row.group_name === values[0] &&
              row.training_year === values[1] &&
              row.training_month === values[2] &&
              row.category === values[3])),
      )
      .slice(offset, offset + limit);
  };
  const mocks = {
    '@/lib/listener-audience': { isListenerAudience },
    '@/lib/listener-pagination': pagination,
    '@/lib/auth': {
      authenticatedAdmin: async () =>
        admin ? { active: true, permissions: ['Tinglovchilar:Ko‘rish'] } : null,
      deviceBinding: async () => device,
    },
    '@/lib/server-data': {
      getDatabase: () => sql,
      hasPermission: (member, permission) =>
        Boolean(member?.active && member.permissions.includes(permission)),
      jsonResponse: (body, status = 200) => Response.json(body, { status }),
      publicError: (error, status) => Response.json({ error }, { status }),
      logServerError: () => {},
      listenerFromDb: (row) => ({ id: row.id, privateDetails: true }),
      publicListenerFromDb: (row) => ({ id: row.id, privateDetails: false }),
      roleFromDb: (row) => row,
      defaultListenerSources: () => ({
        groups: [group56],
        districtsByRegion: {},
      }),
      normalizeListenerSources: (value) => value,
    },
  };
  const exports = {};
  runInNewContext(routeCode, {
    exports,
    Response,
    URL,
    require: (id) => {
      assert.ok(mocks[id], 'Unexpected production dependency: ' + id);
      return mocks[id];
    },
  });
  return {
    calls,
    async state(offset) {
      const query =
        offset === undefined ? '' : `?offset=${encodeURIComponent(offset)}`;
      const response = await exports.GET(
        new Request(`https://mtv.etalimai.uz/api/state${query}`, {
          headers: { 'x-mtv-audience': audience },
        }),
      );
      return { status: response.status, body: await response.json() };
    },
  };
}

test('state returns all 1103 admin listeners over successive pages', async () => {
  const app = setup({ admin: true });
  const seen = [];
  let offset = 0;
  do {
    const result = await app.state(offset);
    assert.equal(result.status, 200);
    assert.equal(result.body.scope.canViewAll, true);
    assert.ok(result.body.listeners.every((row) => row.privateDetails));
    seen.push(...result.body.listeners.map((row) => row.id));
    offset = result.body.pagination.nextOffset;
  } while (offset !== null);
  assert.deepEqual(
    seen,
    records.map((row) => row.id),
  );
});

test('a full final page has no extra empty page', async () => {
  const result = await setup({
    admin: true,
    rows: records.slice(0, 250),
  }).state();
  assert.equal(result.body.listeners.length, 250);
  assert.equal(result.body.pagination.nextOffset, null);
});

test('public state remains bound to its exact cohort on later pages', async () => {
  const outsiders = [
    {
      ...records[0],
      id: 'other-group',
      group_name: 'Nomzod direktor (57-guruh)',
    },
    { ...records[0], id: 'other-year', training_year: '2025' },
    { ...records[0], id: 'other-month', training_month: '08' },
    { ...records[0], id: 'other-category', category: 'Metodist' },
    { ...records[0], id: 'deleted', deleted_at: '2026-09-01' },
  ];
  const app = setup({
    admin: true,
    audience: 'listener',
    device: { listenerId: 'listener-0' },
    rows: [...outsiders, ...records.slice(0, 273)],
  });
  const first = await app.state();
  assert.equal(first.body.scope.canViewAll, false);
  assert.equal(first.body.listeners[0].privateDetails, true);
  assert.equal(first.body.pagination.nextOffset, 250);
  const second = await app.state(250);
  assert.equal(second.body.listeners.length, 23);
  assert.equal(second.body.pagination.nextOffset, null);
  assert.ok(
    second.body.listeners.every(
      (row) => !row.privateDetails && row.id.startsWith('listener-'),
    ),
  );
});

test('an anonymous request cannot promote itself by using admin audience or offset', async () => {
  const result = await setup({ audience: 'admin' }).state(250);
  assert.equal(result.status, 200);
  assert.equal(result.body.scope.kind, 'anonymous');
  assert.deepEqual(result.body.listeners, []);
  assert.equal(result.body.pagination.nextOffset, null);
});

test('an admin cookie on the ordinary form cannot bypass a missing device binding', async () => {
  const result = await setup({ admin: true, audience: 'listener' }).state();
  assert.equal(result.body.scope.canViewAll, false);
  assert.deepEqual(result.body.listeners, []);
});

for (const offset of [
  '-1',
  '1.5',
  'invalid',
  '',
  'Infinity',
  '9007199254740992',
]) {
  test(
    'state rejects malformed pagination offset ' + JSON.stringify(offset),
    async () => {
      const app = setup({ admin: true });
      assert.equal((await app.state(offset)).status, 400);
      assert.equal(app.calls.length, 0);
    },
  );
}

test('a database failure does not masquerade as an empty roster', async () => {
  const result = await setup({ admin: true, databaseFails: true }).state();
  assert.equal(result.status, 503);
  assert.equal(result.body.listeners, undefined);
});

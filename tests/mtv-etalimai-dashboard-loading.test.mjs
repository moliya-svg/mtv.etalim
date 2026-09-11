import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';
import { formatAdminCohort } from '../lib/listener-preview.ts';
import { listenerAudienceHeaders } from '../lib/listener-audience.ts';
import { loadJson, loadListenerPages } from '../lib/listener-loading.ts';

const compiled = ts.transpileModule(
  readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const owner = {
  id: 'owner',
  group: '56-guruh',
  year: '2026',
  category: 'Nomzod direktor',
  startDate: '2026-09-01',
};
const peer = { ...owner, id: 'peer', phone: '+998 ** *** ** 22' };
const privateRecord = {
  ...owner,
  id: 'private-other-group',
  group: '61-guruh',
  phone: '+998 90 123 45 67',
};
const viewer = {
  email: 'test-admin@example.test',
  name: 'Test Admin',
  role: 'Bosh admin',
  permissions: [
    'Tinglovchilar:Ko‘rish',
    'Tinglovchilar:Kiritish',
    'Tinglovchilar:Tahrirlash',
    'Tinglovchi formasi:Ko‘rish',
  ],
};

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}

function harness(path = '/?section=listeners') {
  const state = [],
    requests = [],
    formRenders = [];
  let authenticated = true,
    currentUrl = new URL(path, 'https://mtv.etalimai.uz');
  let cursor = 0,
    changed = false,
    effects = [],
    tree;
  const location = {
    get pathname() {
      return currentUrl.pathname;
    },
    get search() {
      return currentUrl.search;
    },
    get href() {
      return currentUrl.href;
    },
    set href(value) {
      currentUrl = new URL(value, currentUrl);
    },
  };
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state))
        state[index] = typeof initial === 'function' ? initial() : initial;
      return [
        state[index],
        (next) => {
          const value = typeof next === 'function' ? next(state[index]) : next;
          if (!Object.is(value, state[index])) {
            state[index] = value;
            changed = true;
          }
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      return (state[index] ??= { current: initial });
    },
    useMemo(factory) {
      return factory();
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = state[index];
      if (
        !previous ||
        deps.some((dep, i) => !Object.is(dep, previous.deps[i]))
      ) {
        previous?.cleanup?.();
        state[index] = { deps };
        effects.push(() => {
          state[index].cleanup = effect();
        });
      }
    },
  };
  const fetcher = async (url, options = {}) => {
    requests.push({ url, ...options });
    await Promise.resolve();
    if (url === '/api/admin/session')
      return authenticated
        ? Response.json({ authenticated: true, viewer })
        : Response.json({ error: 'Session expired' }, { status: 401 });
    if (url === '/api/admin/logout') {
      authenticated = false;
      return Response.json({ ok: true });
    }
    if (url === '/api/device/session')
      return Response.json({
        bound: true,
        listenerId: 'owner',
        group: '56-guruh',
      });
    if (url.startsWith('/api/state')) {
      const staff =
        authenticated &&
        new Headers(options.headers).get('x-mtv-audience') !== 'listener';
      return Response.json({
        listeners: staff ? [owner, peer, privateRecord] : [owner, peer],
        roles: [],
        sources: { groups: ['56-guruh', '61-guruh'], districtsByRegion: {} },
        scope: { kind: staff ? 'staff' : 'device', canViewAll: staff },
        pagination: { nextOffset: null },
      });
    }
    throw new Error('Unexpected endpoint: ' + url);
  };
  const dependencies = {
    react: hooks,
    'react/jsx-runtime': jsxRuntime,
    'next/link': { default: 'a' },
    '@/lib/listener-preview': { formatAdminCohort },
    '@/lib/listener-audience': { listenerAudienceHeaders },
    '@/lib/listener-loading': {
      loadJson: (url, init) => loadJson(url, init, { fetcher }),
      loadListenerPages: (url, init) =>
        loadListenerPages(url, init, { fetcher }),
    },
    '@/components/form-share-bar': { FormShareBar: () => null },
    '@/components/form-navigation': { FormNavigation: () => null },
    '@/components/google-admin-login': { GoogleAdminLogin: () => null },
  };
  const exports = {};
  runInNewContext(compiled, {
    exports,
    AbortController,
    URL,
    URLSearchParams,
    Error,
    window: {
      location,
      history: {
        replaceState: (_state, _unused, url) => {
          currentUrl = new URL(url, currentUrl);
        },
      },
    },
    fetch: fetcher,
    require: (id) => {
      assert.ok(dependencies[id], id);
      return dependencies[id];
    },
  });
  function render() {
    for (let attempt = 0; attempt < 25; attempt++) {
      cursor = 0;
      changed = false;
      effects = [];
      tree = exports.default();
      const form = nodes(tree).find(
        (node) => node.type?.name === 'ListenerForm',
      );
      if (form)
        formRenders.push({
          isAdminForm: form.props.isAdminForm,
          ids: form.props.rows.map((row) => row.id),
        });
      effects.forEach((effect) => effect());
      if (!changed) return;
    }
    throw new Error('Render did not settle');
  }
  render();
  return {
    requests,
    formRenders,
    get url() {
      return currentUrl.href;
    },
    component(name) {
      return nodes(tree).find((node) => node.type?.name === name);
    },
    expire() {
      authenticated = false;
    },
    async settle() {
      for (let i = 0; i < 8; i++) {
        await new Promise((resolve) => setImmediate(resolve));
        render();
      }
    },
    logout() {
      const button = nodes(tree).find(
        (node) =>
          node.props?.['aria-label'] === 'Boshqaruv sessiyasidan chiqish',
      );
      assert.ok(button);
      button.props.onClick();
    },
  };
}

test('the regular listeners URL recognizes an admin session without device-session dependency', async () => {
  const app = harness();
  await app.settle();
  const panel = app.component('ListenersPanel');
  assert.equal(panel.props.rows.length, 3);
  assert.equal(panel.props.canEdit, true);
  assert.ok(
    app.requests.some((request) => request.url === '/api/admin/session'),
  );
  assert.ok(
    !app.requests.some((request) => request.url === '/api/device/session'),
  );
});

test('the explicit ordinary form never inherits the admin session or other groups', async () => {
  const app = harness('/?section=form');
  await app.settle();
  const form = app.component('ListenerForm');
  assert.equal(form.props.isAdminForm, false);
  assert.equal(form.props.canEdit, false);
  assert.deepEqual(
    Array.from(form.props.rows, (row) => row.id),
    ['owner', 'peer'],
  );
  assert.ok(
    !app.requests.some((request) => request.url === '/api/admin/session'),
  );
  assert.ok(
    app.requests
      .filter((request) => request.url === '/api/state')
      .every((request) => request.headers['x-mtv-audience'] === 'listener'),
  );
});

test('logout clears protected rows before returning to the ordinary form', async () => {
  const app = harness();
  await app.settle();
  app.logout();
  await app.settle();
  assert.equal(app.url, 'https://mtv.etalimai.uz/?section=form');
  assert.ok(app.formRenders.length > 0);
  assert.ok(
    app.formRenders.every(
      (render) => !render.ids.includes('private-other-group'),
    ),
  );
  assert.equal(app.component('ListenerForm').props.canEdit, false);
});

test('expired admin sessions clear the protected roster on refresh', async () => {
  const app = harness();
  await app.settle();
  app.expire();
  app.component('ListenersPanel').props.onRefresh();
  await app.settle();
  const panel = app.component('ListenersPanel');
  assert.equal(panel.props.canEdit, false);
  assert.ok(!panel.props.rows.some((row) => row.id === 'private-other-group'));
});

test('editing from the regular dashboard enters the protected admin form', async () => {
  const app = harness();
  await app.settle();
  app.component('ListenersPanel').props.onEdit(privateRecord);
  await app.settle();
  const form = app.component('ListenerForm');
  assert.equal(app.url, 'https://mtv.etalimai.uz/admin?section=form');
  assert.equal(form.props.isAdminForm, true);
  assert.equal(form.props.canEdit, true);
  assert.equal(form.props.initialEditingRecord.id, privateRecord.id);
});

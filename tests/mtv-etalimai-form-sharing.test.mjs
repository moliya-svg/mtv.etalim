import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as runtime from 'react/jsx-runtime';
import ts from 'typescript';
import { formUrls, formShareText } from '../lib/form-sharing.ts';
const compiled = ts.transpileModule(
  readFileSync(
    new URL('../components/form-share-bar.tsx', import.meta.url),
    'utf8',
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
function descendants(tree) {
  if (Array.isArray(tree)) return tree.flatMap(descendants);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...descendants(tree.props?.children)];
}
function harness(clipboardWorks = true) {
  const slots = [],
    copied = [];
  let cursor = 0,
    tree;
  const mocks = {
    'react/jsx-runtime': runtime,
    './form-share-bar.css': {},
    '@/lib/form-sharing': { formUrls, formShareText },
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [
          slots[index],
          (next) => {
            slots[index] = next;
          },
        ];
      },
    },
  };
  const exports = {};
  runInNewContext(compiled, {
    exports,
    navigator: {
      clipboard: {
        async writeText(value) {
          if (!clipboardWorks) throw new Error('Clipboard denied');
          copied.push(value);
        },
      },
    },
    require: (id) => {
      assert.ok(mocks[id], id);
      return mocks[id];
    },
  });
  function render() {
    cursor = 0;
    tree = exports.FormShareBar();
  }
  render();
  return {
    copied,
    nodes: () => descendants(tree),
    async copy(kind, linkOnly = false) {
      const card = descendants(tree).find(
        (node) => node.props?.className === 'mtv-share-item ' + kind,
      );
      assert.ok(card, 'Missing share card: ' + kind);
      const label = linkOnly
        ? 'Havolani nusxalash'
        : 'Telegram uchun nusxalash';
      const button = descendants(card).find(
        (node) => node.type === 'button' && node.props.children === label,
      );
      assert.ok(button, 'Missing copy action: ' + label);
      button.props.onClick();
      await new Promise((resolve) => setImmediate(resolve));
      render();
    },
    async copyFirst() {
      descendants(tree)
        .find(
          (node) =>
            node.type === 'button' &&
            node.props.children === 'Telegram uchun nusxalash',
        )
        .props.onClick();
      await new Promise((resolve) => setImmediate(resolve));
      render();
    },
    qr() {
      descendants(tree)
        .find(
          (node) => node.props?.['aria-controls'] === 'mtv-form-qr-download',
        )
        .props.onClick();
      render();
    },
  };
}
test('Telegram text is a readable message with the exact audience and URL', () => {
  const publicText = formShareText('listener');
  assert.ok(publicText.includes('\n\n'));
  assert.ok(publicText.includes('Oddiy tinglovchi formasi'));
  assert.ok(publicText.includes(formUrls.listener));
  assert.ok(!publicText.includes(formUrls.admin));
  assert.ok(
    formShareText('admin').includes('o‘z-o‘zidan admin huquqini bermaydi'),
  );
});
test('form strip shows both links and only the public-form QR image', () => {
  const app = harness();
  assert.equal(
    app.nodes().filter((node) => node.props?.href === formUrls.listener).length,
    1,
  );
  assert.equal(
    app.nodes().filter((node) => node.props?.href === formUrls.admin).length,
    1,
  );
  assert.equal(
    app.nodes().find((node) => node.type === 'img').props.src,
    '/mtv-etalimai-form-qr.png',
  );
  app.qr();
  assert.equal(
    app.nodes().find((node) => node.props?.download).props.download,
    'mtv-etalimai-form-qr.png',
  );
});
test('copy action copies Telegram-ready text instead of a bare link', async () => {
  const app = harness();
  await app.copyFirst();
  assert.equal(app.copied[0], formShareText('listener'));
  assert.ok(app.nodes().some((node) => node.type === 'output'));
});
test('denied clipboard offers selectable text instead of false success', async () => {
  const app = harness(false);
  await app.copyFirst();
  assert.equal(app.copied.length, 0);
  assert.equal(
    app.nodes().find((node) => node.type === 'textarea').props.value,
    formShareText('listener'),
  );
});

test('form URLs remain canonical and keep ordinary registration separate from admin', () => {
  assert.equal(formUrls.listener, 'https://mtv.etalimai.uz/?section=form');
  assert.equal(formUrls.admin, 'https://mtv.etalimai.uz/admin?section=form');
  const adminText = formShareText('admin');
  assert.match(adminText, /Google orqali/);
  assert.ok(adminText.includes(formUrls.admin));
  assert.ok(!adminText.includes(formUrls.listener));
});

for (const kind of ['listener', 'admin']) {
  for (const linkOnly of [true, false]) {
    const title = `${kind} ${linkOnly ? 'raw URL' : 'Telegram message'}`;
    const expected = linkOnly ? formUrls[kind] : formShareText(kind);
    test(`${title} copy uses exactly its own URL and matching success feedback`, async () => {
      const app = harness();
      await app.copy(kind, linkOnly);
      assert.equal(app.copied[0], expected);
      assert.ok(
        app
          .nodes()
          .some(
            (node) =>
              node.type === 'button' &&
              node.props.children ===
                (linkOnly ? '✓ Havola nusxalandi' : '✓ Matn nusxalandi'),
          ),
      );
      const feedback = app
        .nodes()
        .find((node) => node.props?.className === 'mtv-share-feedback');
      assert.ok(feedback);
      assert.match(
        feedback.props.children,
        linkOnly ? /Forma havolasi nusxalandi/ : /Telegramga joylashtiring/,
      );
      if (linkOnly) assert.ok(!app.copied[0].includes('\n'));
      else assert.ok(app.copied[0].includes('\n\n'));
    });

    test(`${title} remains manually copyable when clipboard permission is denied`, async () => {
      const app = harness(false);
      await app.copy(kind, linkOnly);
      assert.equal(app.copied.length, 0);
      assert.equal(
        app.nodes().find((node) => node.type === 'textarea').props.value,
        expected,
      );
      assert.equal(
        app
          .nodes()
          .filter((node) => node.props?.className === 'mtv-share-feedback')
          .length,
        0,
      );
    });
  }
}

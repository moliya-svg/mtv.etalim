import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise the real shared mappers; no database or Worker environment is used.
const compiled = ts.transpileModule(
  readFileSync(new URL('../../lib/server-data.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const exports = {};
runInNewContext(compiled, {
  exports,
  Date,
  require: (id) => {
    if (id === 'cloudflare:workers') return { env: {} };
    assert.equal(id, '@neondatabase/serverless');
    return {
      neon: () => {
        throw new Error('A mapper test must not access the database');
      },
    };
  },
});

export const { listenerFromDb, publicListenerFromDb } = exports;

export function listenerDbFixture(overrides = {}) {
  return {
    id: 'peer',
    phone_digits: '902222222',
    start_date: '2026-09-01',
    training_year: '2026',
    category: 'Nomzod direktor',
    group_name: 'Nomzod direktor (56-guruh)',
    initials: 'TL',
    surname: 'Test',
    first_name: 'Listener',
    patronymic: '',
    full_name: 'Test Listener',
    workplace: 'Test MTM',
    region: 'Toshkent shahri',
    district: 'Yunusobod tumani',
    position: 'Direktor',
    birth_date: '1990-02-03',
    note: 'Private test note',
    registration_status: 'Тўлдирилмаган',
    photo_url: 'database:peer-photo',
    order_file_url: 'database:private-order',
    passport_front_url: 'private-passport-front',
    passport_back_url: 'private-passport-back',
    ...overrides,
  };
}

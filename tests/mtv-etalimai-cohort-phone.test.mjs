import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  listenerDbFixture,
  listenerFromDb,
  publicListenerFromDb,
} from './helpers/mtv-etalimai-server-data.mjs';

for (const phone of ['902222222', '+998902222222', '+998 90 222 22 22']) {
  test(`same-cohort peer mapping retains the full formatted phone from ${phone}`, () => {
    const row = listenerDbFixture({ phone_digits: phone });
    const peer = publicListenerFromDb(row);
    assert.equal(peer.phone, '+998 90 222 22 22');
    assert.equal(peer.phone, listenerFromDb(row).phone);
    assert.ok(!peer.phone.includes('*'));
    assert.equal(peer.group, row.group_name);
    assert.equal(peer.year, row.training_year);
    assert.equal(peer.category, row.category);
    assert.equal(peer.startDate, row.start_date);
  });
}

test('full peer phone access does not expose birth date, private notes, order or passports', () => {
  const row = listenerDbFixture();
  const peer = publicListenerFromDb(row);
  assert.equal(peer.phone, '+998 90 222 22 22');
  for (const field of [
    'birthDate',
    'note',
    'orderFile',
    'passportFront',
    'passportBack',
  ]) {
    assert.equal(
      peer[field],
      '',
      field + ' must remain hidden from groupmates',
    );
  }
  const serialized = JSON.stringify(peer);
  for (const secret of [
    row.birth_date,
    row.note,
    row.order_file_url,
    row.passport_front_url,
    row.passport_back_url,
  ]) {
    assert.ok(!serialized.includes(secret));
  }
  assert.equal(peer.photo, '/api/files/peer/photo');
  const owner = listenerFromDb(row);
  assert.equal(owner.birthDate, row.birth_date);
  assert.equal(owner.note, row.note);
  assert.equal(owner.orderFile, '/api/files/peer/order');
});

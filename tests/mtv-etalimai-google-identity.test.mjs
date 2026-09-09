import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { verifyGoogleCredential } from '../lib/google-identity.ts';

const clientId = 'mtv-test.apps.googleusercontent.com';
const nonce = 'test-browser-challenge';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
const keys = createLocalJWKSet({
  keys: [{ ...jwk, kid: 'test', alg: 'RS256' }],
});
const claims = {
  sub: 'test-google-user',
  email: 'ilxomovb2023@gmail.com',
  email_verified: true,
  nonce,
};
async function token(overrides = {}) {
  return new SignJWT({ ...claims, ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer('https://accounts.google.com')
    .setAudience(clientId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

test('accepts signed verified Gmail identity for the correct browser and client', async () => {
  assert.deepEqual(
    await verifyGoogleCredential(await token(), clientId, nonce, keys),
    { email: claims.email, subject: claims.sub },
  );
});
test('accepts authoritative Google Workspace identity', async () => {
  const result = await verifyGoogleCredential(
    await token({ email: 'etalim@appsheet.uz', hd: 'appsheet.uz' }),
    clientId,
    nonce,
    keys,
  );
  assert.equal(result.email, 'etalim@appsheet.uz');
});
for (const { name, overrides } of [
  { name: 'unverified email', overrides: { email_verified: false } },
  { name: 'wrong browser challenge', overrides: { nonce: 'another-browser' } },
  { name: 'missing subject', overrides: { sub: '' } },
  {
    name: 'unverified external domain',
    overrides: { email: 'etalim@appsheet.uz' },
  },
  {
    name: 'wrong Workspace domain',
    overrides: { email: 'etalim@appsheet.uz', hd: 'another.uz' },
  },
]) {
  test(`rejects ${name}`, async () => {
    await assert.rejects(
      verifyGoogleCredential(await token(overrides), clientId, nonce, keys),
    );
  });
}
test('rejects a different OAuth client audience', async () => {
  await assert.rejects(
    verifyGoogleCredential(await token(), 'other-client', nonce, keys),
  );
});
test('rejects expired Google tokens', async () => {
  const expired = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer('https://accounts.google.com')
    .setAudience(clientId)
    .setIssuedAt(1)
    .setExpirationTime(2)
    .sign(privateKey);
  await assert.rejects(verifyGoogleCredential(expired, clientId, nonce, keys));
});
test('rejects a non-Google issuer', async () => {
  const wrongIssuer = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer('https://example.com')
    .setAudience(clientId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  await assert.rejects(
    verifyGoogleCredential(wrongIssuer, clientId, nonce, keys),
  );
});
test('rejects an untrusted signature', async () => {
  const other = await generateKeyPair('RS256');
  const forged = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer('https://accounts.google.com')
    .setAudience(clientId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(other.privateKey);
  await assert.rejects(verifyGoogleCredential(forged, clientId, nonce, keys));
});

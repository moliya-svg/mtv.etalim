import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

const googleKeys = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);

/** Verify Google's signature and the identity, audience and browser challenge. */
export async function verifyGoogleCredential(
  credential: string,
  clientId: string,
  nonce: string,
  keys: JWTVerifyGetKey = googleKeys,
) {
  if (!clientId || !nonce || !credential || credential.length > 12000) {
    throw new Error('Google sign-in parameters are missing');
  }
  const { payload } = await jwtVerify(credential, keys, {
    algorithms: ['RS256'],
    audience: clientId,
    issuer: ['accounts.google.com', 'https://accounts.google.com'],
    requiredClaims: ['sub', 'email', 'email_verified', 'nonce', 'iat', 'exp'],
    maxTokenAge: '10 minutes',
  });
  if (
    payload.nonce !== nonce ||
    payload.email_verified !== true ||
    typeof payload.email !== 'string' ||
    typeof payload.sub !== 'string' ||
    !payload.sub
  ) {
    throw new Error('Google identity was not verified');
  }
  const email = payload.email.trim().toLowerCase();
  // Google is authoritative for Gmail and verified Google Workspace accounts.
  // A Google account registered with an unrelated external email is insufficient.
  if (
    !email.endsWith('@gmail.com') &&
    (typeof payload.hd !== 'string' ||
      payload.hd.toLowerCase() !== email.split('@')[1])
  ) {
    throw new Error('Google is not authoritative for this email');
  }
  return { email, subject: payload.sub };
}

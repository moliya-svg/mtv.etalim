import {
  adminFromVerifiedGoogleEmail,
  adminSessionCookie,
  clearGoogleLoginCookie,
  googleClientId,
  googleLoginChallenge,
  googleLoginNonce,
} from '@/lib/auth';
import { verifyGoogleCredential } from '@/lib/google-identity';
import { jsonResponse, publicError } from '@/lib/server-data';
import { hasSameOrigin, rateLimit } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET() {
  const clientId = googleClientId();
  if (!clientId) return jsonResponse({ enabled: false });
  try {
    const challenge = await googleLoginChallenge();
    const response = jsonResponse({
      enabled: true,
      clientId,
      nonce: challenge.nonce,
    });
    response.headers.append('Set-Cookie', challenge.cookie);
    return response;
  } catch {
    return publicError('Google orqali kirish vaqtincha ishlamayapti.', 503);
  }
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return publicError('Kirish so‘rovi manbasi tasdiqlanmadi.', 403);
  }
  if (!(await rateLimit(request, 'admin-google-login'))) {
    return publicError(
      'Juda ko‘p kirish urinishi. Bir daqiqadan keyin urinib ko‘ring.',
      429,
    );
  }
  const clientId = googleClientId();
  if (!clientId)
    return publicError('Google orqali kirish hali sozlanmagan.', 503);
  if (Number(request.headers.get('content-length') || 0) > 16384) {
    return publicError('Kirish so‘rovi juda katta.', 413);
  }
  let credential: string;
  try {
    const body = await request.text();
    if (body.length > 16384)
      return publicError('Kirish so‘rovi juda katta.', 413);
    const input: unknown = JSON.parse(body);
    if (
      !input ||
      typeof input !== 'object' ||
      !('credential' in input) ||
      typeof input.credential !== 'string'
    ) {
      return publicError('Google tasdig‘i yuborilmadi.', 400);
    }
    credential = input.credential;
  } catch {
    return publicError('Google tasdig‘i noto‘g‘ri yuborildi.', 400);
  }
  const nonce = await googleLoginNonce(request);
  if (!nonce) {
    return publicError(
      'Kirish oynasini yangilang va Google orqali qayta kiring.',
      401,
    );
  }
  let email: string;
  try {
    ({ email } = await verifyGoogleCredential(credential, clientId, nonce));
  } catch {
    // Never log the credential, identity token or raw authentication response.
    return publicError(
      'Google akkaunti tasdiqlanmadi. Kirishni qaytadan boshlang.',
      401,
    );
  }
  const admin = adminFromVerifiedGoogleEmail(email);
  if (!admin) {
    return publicError(
      'Ushbu Google akkauntiga bosh admin huquqi berilmagan.',
      403,
    );
  }
  try {
    const response = jsonResponse({
      authenticated: true,
      viewer: {
        email: admin.email,
        name: admin.name,
        role: admin.role,
        permissions: admin.permissions,
      },
    });
    response.headers.append(
      'Set-Cookie',
      await adminSessionCookie(admin.email),
    );
    response.headers.append('Set-Cookie', clearGoogleLoginCookie());
    return response;
  } catch {
    return publicError('Bosh admin sessiyasini yaratib bo‘lmadi.', 503);
  }
}

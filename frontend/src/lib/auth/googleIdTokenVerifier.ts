import { OAuth2Client } from 'google-auth-library';

// Ported from backend configuration/GoogleSSOAuthExtractor.java (MIGRATION_PLAN.md Phase 5).
// Independently re-verifies the Google ID token's signature/issuer/audience/expiry (audience =
// the same GOOGLE_CLIENT_ID NextAuth's own GoogleProvider already uses) - not just trusting that
// NextAuth handed it a valid token, since this is also called on tokens obtained via Google's
// refresh endpoint directly (see [...nextauth].ts's jwt callback), which NextAuth's own
// provider-level verification doesn't cover.

export interface VerifiedGoogleUser {
  email: string;
  emailVerified: boolean;
}

let client: OAuth2Client | null = null;
function getClient(): OAuth2Client {
  if (!client) {
    client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return client;
}

// GoogleSSOAuthExtractor.extract: sanitizes "Bearer <token>" -> "<token>", verifies, and on any
// failure (invalid signature, wrong audience, expired, malformed) returns Optional.empty() - the
// Java catch-all `catch (Exception e)` swallows everything, mirrored here by returning null.
export async function verifyGoogleIdToken(bearerOrRawToken: string): Promise<VerifiedGoogleUser | null> {
  const idToken = bearerOrRawToken.replace('Bearer ', '').trim();
  if (!idToken) return null;

  try {
    const ticket = await getClient().verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) return null;
    return { email: payload.email, emailVerified: payload.email_verified === true };
  } catch {
    return null;
  }
}

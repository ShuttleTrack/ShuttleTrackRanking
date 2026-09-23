// Where sign-in lands when nothing else asked for a destination. `/squads` rather than `/`
// (SELF_REGISTRATION_PLAN.md): a session with no squad is now a real state, and the public
// aggregate board tells such a person nothing about what to do next, whereas /squads offers the
// squad directory. Existing members are unaffected in practice - /squads redirects straight to
// the board when you belong to exactly one squad. An explicit ?callbackUrl= still wins, so
// being bounced to login from a deep link still returns you there.
const DEFAULT_CALLBACK = '/squads';

/** Same-origin relative path only — blocks open redirects via `//` or absolute URLs. */
export function safeCallbackUrl(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'string') return DEFAULT_CALLBACK;
  if (!value.startsWith('/') || value.startsWith('//')) return DEFAULT_CALLBACK;
  return value;
}

export function getLoginErrorMessage(error: string | string[] | undefined): string | null {
  const code = Array.isArray(error) ? error[0] : error;
  if (!code || typeof code !== 'string') return null;
  if (code === 'AccessDenied') {
    // Deliberately no longer "you're not on the club roster - ask a squad admin to add you".
    // That was accurate while signing in required an existing SquadAdmin/Player row, but
    // self-registration removed that gate (SELF_REGISTRATION_PLAN.md): not being on any roster
    // is now the normal starting state, and telling those people to go find an admin would
    // send them away from the join-request flow that exists for exactly them. The only
    // remaining causes are a Google token that fails verification or an unverified address.
    return "We couldn't verify that Google account. Check that its email address is verified with Google, then try again.";
  }
  return 'Sign-in did not go through. Please try again.';
}

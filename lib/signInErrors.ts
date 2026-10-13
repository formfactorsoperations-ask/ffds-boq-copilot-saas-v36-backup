/*
  What the sign-in screen says when Firebase refuses a sign-in.

  It used to show Firebase's own text, "Firebase: Error
  (auth/invalid-credential).", which tells a new team member nothing about
  what to do next. Firebase gives the same code for a wrong password and for
  an email it does not know, so the message covers both.
*/

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': "That email and password don't match. Check for a typo, ask your studio to reset your password from Team & roles, or use Continue with Google.",
  'auth/wrong-password': "That email and password don't match. Check for a typo, ask your studio to reset your password from Team & roles, or use Continue with Google.",
  'auth/user-not-found': "That email and password don't match. Check for a typo, ask your studio to reset your password from Team & roles, or use Continue with Google.",
  'auth/invalid-email': "That doesn't look like an email address. Check it and try again.",
  'auth/missing-password': 'Enter your password.',
  'auth/user-disabled': 'This login has been switched off. Ask your studio to add you back on Team & roles.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes, or ask your studio to reset your password.',
  'auth/network-request-failed': "Couldn't reach the server. Check your internet connection and try again.",
  'auth/popup-closed-by-user': 'The Google window was closed before signing in. Try again.',
  'auth/cancelled-popup-request': 'The Google window was closed before signing in. Try again.',
  'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
  'auth/account-exists-with-different-credential': 'This email already signs in another way. Use your email and password.',
};

/** A plain sentence for a Firebase sign-in error, or the fallback when the code is unknown. */
export function signInMessage(err: unknown, fallback = "Couldn't sign you in. Please try again."): string {
  const code = String((err as any)?.code || '');
  if (MESSAGES[code]) return MESSAGES[code];
  const inText = Object.keys(MESSAGES).find((c) => String((err as any)?.message || '').includes(c));
  return inText ? MESSAGES[inText] : fallback;
}

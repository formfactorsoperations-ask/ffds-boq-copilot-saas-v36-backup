/*
  Sign-in messages (lib/signInErrors.ts): plain words, never Firebase's own text.
*/
import { test, expect } from 'vitest';
import { signInMessage } from '../../lib/signInErrors';

test('a wrong password or unknown email says what to do next', () => {
  for (const code of ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found']) {
    const m = signInMessage({ code, message: `Firebase: Error (${code}).` });
    expect(m).toMatch(/don't match/);
    expect(m).toMatch(/reset your password/);
    expect(m).not.toMatch(/Firebase/);
  }
});

test('the code is also found in the message, and unknown errors fall back', () => {
  expect(signInMessage({ message: 'Firebase: Error (auth/too-many-requests).' })).toMatch(/Too many tries/);
  expect(signInMessage(new Error('boom'))).toBe("Couldn't sign you in. Please try again.");
  expect(signInMessage(null, 'Google sign-in failed')).toBe('Google sign-in failed');
});

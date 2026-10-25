import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

/**
 * { status, user, error, retry, signIn, signOut }. status is 'loading',
 * 'authenticated', 'anonymous', or 'error' (we could not reach the server, so
 * we do not know yet whether you are logged in).
 */
export function useAuth() {
  return useContext(AuthContext);
}

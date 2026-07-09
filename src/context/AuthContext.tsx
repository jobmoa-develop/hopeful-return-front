import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { tokenStore } from '../auth/token';
import type { AuthUser } from '../auth/token';
import { subscribeSession } from '../auth/sessionEvents';

type AuthContextType = {
  accessToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (accessToken: string, user: AuthUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(() => tokenStore.getAccessToken());
  const [user, setUser] = useState<AuthUser | null>(() => tokenStore.getUser());

  useEffect(() => {
    return subscribeSession((event) => {
      if (event.type === 'accessTokenChanged') {
        setAccessToken(event.accessToken);
      }

      if (event.type === 'sessionCleared') {
        setAccessToken(null);
        setUser(null);
      }
    });
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      accessToken,
      user,
      isAuthenticated: Boolean(accessToken),
      login: (nextAccessToken, nextUser) => {
        tokenStore.setAccessToken(nextAccessToken);
        tokenStore.setUser(nextUser);
        setAccessToken(nextAccessToken);
        setUser(nextUser);
      },
      logout: () => {
        tokenStore.clear();
        setAccessToken(null);
        setUser(null);
      },
    }),
    [accessToken, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

type SessionEvent =
  | { type: 'accessTokenChanged'; accessToken: string }
  | { type: 'sessionCleared' };

type SessionListener = (event: SessionEvent) => void;

const listeners = new Set<SessionListener>();

export function subscribeSession(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyAccessTokenChanged(accessToken: string): void {
  listeners.forEach((listener) => listener({ type: 'accessTokenChanged', accessToken }));
}

export function notifySessionCleared(): void {
  listeners.forEach((listener) => listener({ type: 'sessionCleared' }));
}

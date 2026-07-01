import { create } from 'zustand';
import type { Org, User } from '@techbuilder/contracts';
import { createClients, type AdapterMode, type Clients } from '../engine/adapters';

// STEP 2/3 run against the mock adapter. STEP 4: set EXPO_PUBLIC_ADAPTER=rest + EXPO_PUBLIC_API_URL to flip.
const MODE = (process.env.EXPO_PUBLIC_ADAPTER as AdapterMode | undefined) ?? 'mock';
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

interface SessionState {
  clients: Clients;
  mode: AdapterMode;
  user: User | null;
  org: Org | null;
  accessToken: string | null;
  refreshToken: string | null;
  language: 'hi' | 'en';
  setSession: (user: User, org: Org, accessToken?: string, refreshToken?: string) => void;
  clear: () => void;
  setLanguage: (l: 'hi' | 'en') => void;
}

export const useSession = create<SessionState>((set, get) => ({
  // rest mode reads the live token from the store on every request (no circular import)
  clients: createClients(MODE, MODE === 'rest' ? { apiBaseUrl: API_URL, getAccessToken: () => get().accessToken } : undefined),
  mode: MODE,
  user: null,
  org: null,
  accessToken: null,
  refreshToken: null,
  language: 'hi',
  setSession: (user, org, accessToken, refreshToken) =>
    set({ user, org, accessToken: accessToken ?? null, refreshToken: refreshToken ?? null }),
  clear: () => set({ user: null, org: null, accessToken: null, refreshToken: null }),
  setLanguage: (language) => set({ language }),
}));

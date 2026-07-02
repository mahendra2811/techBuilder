import { create } from 'zustand';
import type { Org, User } from '@techbuilder/contracts';
import { createClients, type AdapterMode, type Clients } from '../engine/adapters';
import { DelegatingOutboxStore, Outbox } from '../engine/sync/outbox';
import { withOfflineOutbox } from '../engine/sync/offline-records';

// STEP 2/3 run against the mock adapter. STEP 4: set EXPO_PUBLIC_ADAPTER=rest + EXPO_PUBLIC_API_URL to flip.
const MODE = (process.env.EXPO_PUBLIC_ADAPTER as AdapterMode | undefined) ?? 'mock';
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

/**
 * WP-6 offline posture (rest mode only): attendance / expense / fuel queue in the outbox
 * when the network is down; every other write is online-required and surfaces a clear
 * offline notice. The RN shell swaps this store to the persistent expo-sqlite store at
 * boot and flushes on start + app-foreground (see src/app/_layout.tsx).
 */
export const outboxStore = new DelegatingOutboxStore();

interface SessionState {
  clients: Clients;
  /** null in mock mode — mock is already local, nothing to sync. */
  outbox: Outbox | null;
  mode: AdapterMode;
  user: User | null;
  org: Org | null;
  accessToken: string | null;
  refreshToken: string | null;
  language: 'hi' | 'en';
  /** `saved-offline:<entity>` or `offline-rejected:<method>` — UI shows a toast + clears. */
  offlineNotice: string | null;
  setSession: (user: User, org: Org, accessToken?: string, refreshToken?: string) => void;
  clear: () => void;
  setLanguage: (l: 'hi' | 'en') => void;
  setOfflineNotice: (n: string | null) => void;
  flushOutbox: () => Promise<void>;
}

export const useSession = create<SessionState>((set, get) => {
  let clients: Clients;
  let outbox: Outbox | null = null;
  if (MODE === 'rest') {
    // rest mode reads the live token from the store on every request (no circular import)
    const base = createClients('rest', { apiBaseUrl: API_URL, getAccessToken: () => get().accessToken });
    outbox = new Outbox(outboxStore, base.sync);
    const records = withOfflineOutbox(base.records, outbox, {
      getUserId: () => get().user?.id ?? null,
      onQueued: (entityType) => set({ offlineNotice: `saved-offline:${entityType}` }),
      onOfflineRejected: (method) => set({ offlineNotice: `offline-rejected:${method}` }),
    });
    clients = { auth: base.auth, records, sync: base.sync };
  } else {
    clients = createClients(MODE);
  }

  return {
    clients,
    outbox,
    mode: MODE,
    user: null,
    org: null,
    accessToken: null,
    refreshToken: null,
    language: 'hi',
    offlineNotice: null,
    setSession: (user, org, accessToken, refreshToken) =>
      set({ user, org, accessToken: accessToken ?? null, refreshToken: refreshToken ?? null }),
    clear: () => set({ user: null, org: null, accessToken: null, refreshToken: null }),
    setLanguage: (language) => set({ language }),
    setOfflineNotice: (offlineNotice) => set({ offlineNotice }),
    flushOutbox: async () => {
      const ob = get().outbox;
      if (ob) await ob.flush();
    },
  };
});

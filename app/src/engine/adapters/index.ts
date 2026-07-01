/**
 * Client registry — the swap point. Screens get { auth, records, sync } and never know which adapter backs them.
 * mode is an app/env decision (NOT in OrgConfig). STEP 2/3 use 'mock'; STEP 4 flips to 'rest' (zero screen changes).
 */
import type { AuthClient, RecordsClient, SyncClient } from '@techbuilder/contracts';
import { MockClient } from './mock';
import { RestClient, type RestOptions } from './rest';

export interface Clients {
  auth: AuthClient;
  records: RecordsClient;
  sync: SyncClient;
}

export type AdapterMode = 'mock' | 'rest';

export function createClients(mode: AdapterMode = 'mock', rest?: RestOptions): Clients {
  if (mode === 'rest') {
    if (!rest) throw new Error('rest mode requires RestOptions { apiBaseUrl, getAccessToken }');
    const c = new RestClient(rest);
    return { auth: c, records: c, sync: c };
  }
  const c = new MockClient();
  return { auth: c, records: c, sync: c };
}

export { MockClient } from './mock';
export { RestClient } from './rest';
export type { RestOptions } from './rest';

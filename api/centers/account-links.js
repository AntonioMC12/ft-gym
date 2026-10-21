import { CentersError } from './errors.js';

// JSON identity is single-process. Keep its deletion and SQL linking mutually exclusive until
// identity itself is migrated; no claim of an atomic JSON+SQL transaction is made.
export function createAccountLocks(lookupAccount) {
  const locked = new Set();
  return {
    async withAccounts(uids, work, { requireExisting = true } = {}) {
      const ids = [...new Set(uids)].sort();
      if (ids.some(uid => locked.has(uid))) throw new CentersError(409, 'account-busy', 'account is being updated');
      if (requireExisting && ids.some(uid => !lookupAccount(uid))) throw new CentersError(404, 'not-found', 'not found');
      ids.forEach(uid => locked.add(uid));
      try { return await work(); }
      finally { ids.forEach(uid => locked.delete(uid)); }
    },
  };
}
